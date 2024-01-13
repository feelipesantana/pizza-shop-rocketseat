import dayjs from "dayjs";
import { and, eq, gte, lte, sql, sum } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "../../db/connection";
import { orders } from "../../db/schemas";
import { authenticate } from "../authenticate";

export const getDailyReceiptInPeriod = new Elysia().use(authenticate).get(
	"/metrics/daily-receipt-in-period",
	async ({ getManagedRestaurantId, query, set }) => {
		const restaurantId = await getManagedRestaurantId();
		const { from, to } = query;

		const startDate = from ? dayjs(from) : dayjs().subtract(7, "d");
		const endDate = to ? dayjs(to) : from ? startDate.add(7, "days") : dayjs();

		if (endDate.diff(startDate, "days") > 7) {
			set.status = 400;

			return {
				code: "INVALID_PERIOD",
				message: "The interval of date cant be above 7 days",
			};
		}

		const receiptPerDay = await db
			.select({
				date: sql<string>`TO_CHAR(${orders.createdAt}, 'DD/MM')`,
				receipt: sum(orders.totalInCents).mapWith(Number),
			})
			.from(orders)
			.where(
				and(
					eq(orders.restaurantId, restaurantId),
					gte(orders.createdAt, startDate.startOf("day").toDate()),
					lte(orders.createdAt, endDate.endOf("day").toDate()),
				),
			)
			.groupBy(sql`TO_CHAR(${orders.createdAt}, 'DD/MM')`)
			.having(({ receipt }) => gte(receipt, 1));

		const orderedReceiptPerDay = receiptPerDay.sort((a, b) => {
			const [dayA, monthA] = a.date.split("/").map(Number);
			const [dayB, monthB] = b.date.split("/").map(Number);

			if (monthA === monthB) {
				return dayA - dayB;
			}
			const dateA = new Date(2023, monthA - 1);
			const dateB = new Date(2023, monthB - 1);

			return dateA.getTime() - dateB.getTime();
		});

		return orderedReceiptPerDay;
	},
	{
		query: t.Object({
			to: t.Optional(t.String()),
			from: t.Optional(t.String()),
		}),
	},
);

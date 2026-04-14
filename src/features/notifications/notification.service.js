const prisma = require("../../prisma");

/**
 * Build a notification payload for a single user.
 */
function buildNotification({
	userId,
	type,
	title,
	message,
	targetType,
	targetId,
}) {
	return {
		userId,
		type,
		title,
		message,
		targetType,
		targetId,
	};
}

/**
 * Create many notifications at once.
 */
async function createNotifications(notifications) {
	if (!Array.isArray(notifications) || notifications.length === 0) {
		return { count: 0 };
	}

	return prisma.notification.createMany({
		data: notifications,
	});
}

/**
 * Notify students for a newly created announcement.
 *
 * Assumes announcement may contain audience/year targeting.
 * Adjust the matching logic if your announcement model uses different fields.
 */
async function notifyStudentsForAnnouncement(announcement) {
	if (!announcement?.id) {
		throw new Error("announcement is required");
	}

	const students = await prisma.user.findMany({
		where: {
			role: "student",
			isActive: true,
			...(announcement.year || announcement.audienceYear
				? {
						year: announcement.year ?? announcement.audienceYear,
					}
				: {}),
		},
		select: {
			id: true,
		},
	});

	if (students.length === 0) {
		return { count: 0 };
	}

	const notifications = students.map((student) =>
		buildNotification({
			userId: student.id,
			type: "announcement",
			title: "New Announcement",
			message: announcement.title || "A new announcement has been posted.",
			targetType: "announcement",
			targetId: announcement.id,
		}),
	);

	return createNotifications(notifications);
}

/**
 * Notify students for a newly created form.
 *
 * If form.year is null, all active students receive it.
 * If form.year is set, only matching-year students receive it.
 */
async function notifyStudentsForForm(form) {
	if (!form?.id) {
		throw new Error("form is required");
	}

	const students = await prisma.user.findMany({
		where: {
			role: "student",
			isActive: true,
			...(form.year
				? {
						year: form.year,
					}
				: {}),
		},
		select: {
			id: true,
		},
	});

	if (students.length === 0) {
		return { count: 0 };
	}

	const notifications = students.map((student) =>
		buildNotification({
			userId: student.id,
			type: "form",
			title: "New Form Available",
			message: form.title || "A new form has been posted.",
			targetType: "form",
			targetId: form.id,
		}),
	);

	return createNotifications(notifications);
}

module.exports = {
	buildNotification,
	createNotifications,
	notifyStudentsForAnnouncement,
	notifyStudentsForForm,
};

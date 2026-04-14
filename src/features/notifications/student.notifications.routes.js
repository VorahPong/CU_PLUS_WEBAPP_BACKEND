const express = require("express");
const prisma = require("../../prisma");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Student Notifications
 *   description: Notification inbox for students
 */

/**
 * @swagger
 * /student/notifications:
 *   get:
 *     summary: Get the current student's notifications
 *     tags: [Student Notifications]
 *     responses:
 *       200:
 *         description: Notifications returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notifications:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: 0d62d8b1-7c61-4c1f-8f6c-9a2b2f8a0001
 *                       userId:
 *                         type: string
 *                         example: 0d62d8b1-7c61-4c1f-8f6c-9a2b2f8a0002
 *                       type:
 *                         type: string
 *                         example: form
 *                       title:
 *                         type: string
 *                         example: New Form Available
 *                       message:
 *                         type: string
 *                         example: Student Check-In Form
 *                       targetType:
 *                         type: string
 *                         example: form
 *                       targetId:
 *                         type: string
 *                         example: 0d62d8b1-7c61-4c1f-8f6c-9a2b2f8a0003
 *                       isRead:
 *                         type: boolean
 *                         example: false
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/", requireAuth, async (req, res) => {
	try {
		const notifications = await prisma.notification.findMany({
			where: {
				userId: req.user.id,
			},
			orderBy: {
				createdAt: "desc",
			},
		});

		return res.json({ notifications });
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

/**
 * @swagger
 * /student/notifications/unread-count:
 *   get:
 *     summary: Get unread notification count for the current student
 *     tags: [Student Notifications]
 *     responses:
 *       200:
 *         description: Unread count returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 unreadCount:
 *                   type: integer
 *                   example: 3
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/unread-count", requireAuth, async (req, res) => {
	try {
		const unreadCount = await prisma.notification.count({
			where: {
				userId: req.user.id,
				isRead: false,
			},
		});

		return res.json({ unreadCount });
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

/**
 * @swagger
 * /student/notifications/{id}/read:
 *   patch:
 *     summary: Mark a notification as read
 *     tags: [Student Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Server error
 */
router.patch("/:id/read", requireAuth, async (req, res) => {
	try {
		const { id } = req.params;

		const existing = await prisma.notification.findFirst({
			where: {
				id,
				userId: req.user.id,
			},
		});

		if (!existing) {
			return res.status(404).json({
				message: "Notification not found",
			});
		}

		const notification = await prisma.notification.update({
			where: { id },
			data: {
				isRead: true,
			},
		});

		return res.json({
			message: "Notification marked as read",
			notification,
		});
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

/**
 * @swagger
 * /student/notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read for the current student
 *     tags: [Student Notifications]
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: All notifications marked as read
 *                 count:
 *                   type: integer
 *                   example: 5
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.patch("/read-all", requireAuth, async (req, res) => {
	try {
		const result = await prisma.notification.updateMany({
			where: {
				userId: req.user.id,
				isRead: false,
			},
			data: {
				isRead: true,
			},
		});

		return res.json({
			message: "All notifications marked as read",
			count: result.count,
		});
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

/**
 * @swagger
 * /student/notifications/{id}:
 *   delete:
 *     summary: Delete a specific notification
 *     tags: [Student Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Server error
 */
router.delete("/:id", requireAuth, async (req, res) => {
	try {
		const { id } = req.params;

		const existing = await prisma.notification.findFirst({
			where: {
				id,
				userId: req.user.id,
			},
		});

		if (!existing) {
			return res.status(404).json({
				message: "Notification not found",
			});
		}

		await prisma.notification.delete({
			where: { id },
		});

		return res.json({
			message: "Notification deleted successfully",
		});
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

/**
 * @swagger
 * /student/notifications:
 *   delete:
 *     summary: Clear all notifications for the current student
 *     tags: [Student Notifications]
 *     responses:
 *       200:
 *         description: All notifications cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: All notifications cleared successfully
 *                 count:
 *                   type: integer
 *                   example: 8
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.delete("/", requireAuth, async (req, res) => {
	try {
		const result = await prisma.notification.deleteMany({
			where: {
				userId: req.user.id,
			},
		});

		return res.json({
			message: "All notifications cleared successfully",
			count: result.count,
		});
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

module.exports = router;

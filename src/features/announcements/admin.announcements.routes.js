const express = require("express");
const prisma = require("../../prisma");
const { requireAuth, requireAdmin } = require("../../middleware/auth");

const {
	notifyStudentsForAnnouncement,
} = require("../notifications/notification.service");

const router = express.Router();

/**
 * @swagger
 * /admin/announcements:
 *   post:
 *     summary: Create a new announcement
 *     tags: [Admin Announcements]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: Classes are canceled tomorrow
 *               everyone:
 *                 type: boolean
 *                 example: true
 *               firstYear:
 *                 type: boolean
 *                 example: false
 *               secondYear:
 *                 type: boolean
 *                 example: false
 *               thirdYear:
 *                 type: boolean
 *                 example: false
 *               fourthYear:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       201:
 *         description: Announcement created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post("/", requireAuth, requireAdmin, async (req, res) => {
	try {
		const {
			message,
			everyone,
			firstYear,
			secondYear,
			thirdYear,
			fourthYear,
		} = req.body;

		if (!message || !message.trim()) {
			return res.status(400).json({
				message: "message is required",
			});
		}

		const hasAudience =
			everyone || firstYear || secondYear || thirdYear || fourthYear;

		if (!hasAudience) {
			return res.status(400).json({
				message: "At least one audience must be selected",
			});
		}

		const createdAnnouncement = await prisma.announcement.create({
			data: {
				message: message.trim(),
				everyone: Boolean(everyone),
				firstYear: Boolean(firstYear),
				secondYear: Boolean(secondYear),
				thirdYear: Boolean(thirdYear),
				fourthYear: Boolean(fourthYear),
				authorId: req.user.id,
			},
			include: {
				author: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						name: true,
						email: true,
						role: true,
					},
				},
			},
		});

		// put it into notification
		await notifyStudentsForAnnouncement(createdAnnouncement);

		return res.status(201).json({
			message: "Announcement created successfully",
			announcement: createdAnnouncement,
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
 * /admin/announcements:
 *   get:
 *     summary: Get all announcements
 *     tags: [Admin Announcements]
 *     responses:
 *       200:
 *         description: List of announcements
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get("/", requireAuth, requireAdmin, async (req, res) => {
	try {
		const announcements = await prisma.announcement.findMany({
			orderBy: { createdAt: "desc" },
			include: {
				author: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						name: true,
						email: true,
						role: true,
					},
				},
			},
		});

		return res.json({ announcements });
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

/**
 * @swagger
 * /admin/announcements/{id}:
 *   delete:
 *     summary: Delete an announcement
 *     tags: [Admin Announcements]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Announcement ID
 *     responses:
 *       200:
 *         description: Announcement deleted successfully
 *       404:
 *         description: Announcement not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { id } = req.params;

		const existing = await prisma.announcement.findUnique({
			where: { id },
		});

		if (!existing) {
			return res.status(404).json({
				message: "Announcement not found",
			});
		}

		await prisma.announcement.delete({
			where: { id },
		});

		return res.json({
			message: "Announcement deleted successfully",
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
 * /admin/announcements/{id}:
 *   put:
 *     summary: Update an announcement
 *     tags: [Admin Announcements]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Announcement ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: Updated announcement message
 *               everyone:
 *                 type: boolean
 *               firstYear:
 *                 type: boolean
 *               secondYear:
 *                 type: boolean
 *               thirdYear:
 *                 type: boolean
 *               fourthYear:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Announcement updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Announcement not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
	try {
		const { id } = req.params;
		const {
			message,
			everyone,
			firstYear,
			secondYear,
			thirdYear,
			fourthYear,
		} = req.body;

		const existing = await prisma.announcement.findUnique({
			where: { id },
		});

		if (!existing) {
			return res.status(404).json({
				message: "Announcement not found",
			});
		}

		if (!message || !message.trim()) {
			return res.status(400).json({
				message: "message is required",
			});
		}

		const hasAudience =
			everyone || firstYear || secondYear || thirdYear || fourthYear;

		if (!hasAudience) {
			return res.status(400).json({
				message: "At least one audience must be selected",
			});
		}

		const updatedAnnouncement = await prisma.announcement.update({
			where: { id },
			data: {
				message: message.trim(),
				everyone: Boolean(everyone),
				firstYear: Boolean(firstYear),
				secondYear: Boolean(secondYear),
				thirdYear: Boolean(thirdYear),
				fourthYear: Boolean(fourthYear),
			},
			include: {
				author: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						name: true,
						email: true,
						role: true,
					},
				},
			},
		});

		return res.json({
			message: "Announcement updated successfully",
			announcement: updatedAnnouncement,
		});
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

module.exports = router;
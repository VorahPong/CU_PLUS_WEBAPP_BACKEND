const express = require("express");
const prisma = require("../../prisma");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

/**
 * @swagger
 * /student/announcements/my-feed:
 *   get:
 *     summary: Get announcements for the current student
 *     tags: [Student Announcements]
 *     responses:
 *       200:
 *         description: List of announcements filtered by student year or everyone
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 announcements:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: 123e4567-e89b-12d3-a456-426614174000
 *                       message:
 *                         type: string
 *                         example: Classes are canceled tomorrow
 *                       status:
 *                         type: string
 *                         example: published
 *                       everyone:
 *                         type: boolean
 *                       firstYear:
 *                         type: boolean
 *                       secondYear:
 *                         type: boolean
 *                       thirdYear:
 *                         type: boolean
 *                       fourthYear:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       author:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           firstName:
 *                             type: string
 *                           lastName:
 *                             type: string
 *                           email:
 *                             type: string
 *                           role:
 *                             type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
// GET /announcements/my-feed
router.get("/my-feed", requireAuth, async (req, res) => {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.user.id },
			select: {
				id: true,
				year: true,
				role: true,
			},
		});

		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const yearFilter = {};

		if (user.year === "1") yearFilter.firstYear = true;
		if (user.year === "2") yearFilter.secondYear = true;
		if (user.year === "3") yearFilter.thirdYear = true;
		if (user.year === "4") yearFilter.fourthYear = true;

		const announcements = await prisma.announcement.findMany({
			where: {
				status: "published",
				OR: [{ everyone: true }, yearFilter],
			},
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

module.exports = router;

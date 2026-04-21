const express = require("express");
const prisma = require("../../prisma");
const { requireAuth } = require("../../middleware/auth");
const cloudinary = require("../../cloudinary");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Profile
 *   description: Current user profile settings
 */

/**
 * @swagger
 * /me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Profile]
 *     responses:
 *       200:
 *         description: Current user profile returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     name:
 *                       type: string
 *                       nullable: true
 *                     schoolId:
 *                       type: string
 *                     year:
 *                       type: string
 *                     role:
 *                       type: string
 *                     profileImageUrl:
 *                       type: string
 *                       nullable: true
 *                     profileImagePublicId:
 *                       type: string
 *                       nullable: true
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get("/me", requireAuth, async (req, res) => {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.user.id },
			select: {
				id: true,
				email: true,
				firstName: true,
				lastName: true,
				name: true,
				schoolId: true,
				year: true,
				role: true,
				profileImageUrl: true,
				profileImagePublicId: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		if (!user) {
			return res.status(404).json({
				message: "User not found",
			});
		}

		return res.json({ user });
	} catch (e) {
		return res.status(500).json({
			message: "Server error",
			error: String(e),
		});
	}
});

/**
 * @swagger
 * /me:
 *   patch:
 *     summary: Update current user profile
 *     tags: [Profile]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.patch("/me", requireAuth, async (req, res) => {
	try {
		const { name } = req.body;

		const existing = await prisma.user.findUnique({
			where: { id: req.user.id },
		});

		if (!existing) {
			return res.status(404).json({
				message: "User not found",
			});
		}

		const updatedUser = await prisma.user.update({
			where: { id: req.user.id },
			data: {
				name: name != null ? name.toString().trim() || null : existing.name,
			},
			select: {
				id: true,
				email: true,
				firstName: true,
				lastName: true,
				name: true,
				schoolId: true,
				year: true,
				role: true,
				profileImageUrl: true,
				profileImagePublicId: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		return res.json({
			message: "Profile updated successfully",
			user: updatedUser,
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
 * /me/profile-image:
 *   post:
 *     summary: Upload current user profile image
 *     tags: [Profile]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dataUrl
 *             properties:
 *               dataUrl:
 *                 type: string
 *                 description: Base64 image data URL
 *                 example: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...
 *     responses:
 *       200:
 *         description: Profile image uploaded successfully
 *       400:
 *         description: Invalid image data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Upload failed
 */
router.post("/me/profile-image", requireAuth, async (req, res) => {
	try {
		const { dataUrl } = req.body;

		if (!dataUrl || typeof dataUrl !== "string") {
			return res.status(400).json({
				message: "No image provided",
			});
		}

		if (!dataUrl.startsWith("data:image/")) {
			return res.status(400).json({
				message: "Invalid image format",
			});
		}

		const existing = await prisma.user.findUnique({
			where: { id: req.user.id },
			select: {
				id: true,
				profileImageUrl: true,
				profileImagePublicId: true,
			},
		});

		if (!existing) {
			return res.status(404).json({
				message: "User not found",
			});
		}

		if (existing.profileImagePublicId) {
			try {
				await cloudinary.uploader.destroy(existing.profileImagePublicId, {
					resource_type: "image",
				});
			} catch (cloudinaryError) {
				console.error(
					`Failed to delete old profile image for user ${req.user.id}:`,
					cloudinaryError,
				);
			}
		}

		const result = await cloudinary.uploader.upload(dataUrl, {
			folder: "cuplus/profile-images",
			resource_type: "image",
		});

		const updatedUser = await prisma.user.update({
			where: { id: req.user.id },
			data: {
				profileImageUrl: result.secure_url,
				profileImagePublicId: result.public_id,
			},
			select: {
				id: true,
				email: true,
				firstName: true,
				lastName: true,
				name: true,
				schoolId: true,
				year: true,
				role: true,
				profileImageUrl: true,
				profileImagePublicId: true,
			},
		});

		return res.json({
			message: "Profile image uploaded successfully",
			user: updatedUser,
		});
	} catch (e) {
		console.error(e);
		return res.status(500).json({
			message: "Upload failed",
			error: String(e),
		});
	}
});

module.exports = router;

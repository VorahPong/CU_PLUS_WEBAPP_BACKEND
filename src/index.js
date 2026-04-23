const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

const app = express();
app.use(
	cors({
		origin: process.env.FRONTEND_URL, // change to your Flutter web origin
		credentials: true,
	}),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// health check (keep this)
app.get("/health", (req, res) => {
	res.json({ ok: true, message: "backend is running" });
});

// feature routes
const authRoutes = require("./features/auth/auth.routes");
const adminStudentsRoutes = require("./features/manageStudent/admin.students.routes");
const adminAnnouncementsRoutes = require("./features/announcements/admin.announcements.routes");

const studentAnnouncementsRoutes = require("./features/announcements/student.announcements.route");

const adminFormsRoutes = require("./features/forms/admin.forms.routes");
const studentFormsRoutes = require("./features/forms/student.forms.routes");

const courseFoldersRoutes = require("./features/courseContent/admin.courseContent.routes");

app.use("/auth", authRoutes);

app.use("/admin/announcements", adminAnnouncementsRoutes);
app.use("/admin/students", adminStudentsRoutes);

app.use("/admin/forms", adminFormsRoutes);

const formsExportRoutes = require("./features/forms/forms.export.routes");
app.use("/forms", formsExportRoutes);

app.use("/student/announcements", studentAnnouncementsRoutes);
app.use("/student/forms", studentFormsRoutes);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/course-content", courseFoldersRoutes);

const studentNotificationsRoutes = require("./features/notifications/student.notifications.routes");

app.use("/student/notifications", studentNotificationsRoutes);

const profileRoutes = require("./features/settings/profile.routes");

app.use("/", profileRoutes);

// start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
	console.log(`API running on port ${PORT}`);
});

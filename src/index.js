const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

const app = express();
app.use(
	cors({
		origin: "http://localhost:3000", // change to your Flutter web origin
		credentials: true,
	}),
);

app.use(express.json());
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

app.use("/auth", authRoutes);
app.use("/admin/announcements", adminAnnouncementsRoutes);
app.use("/admin/students", adminStudentsRoutes);
app.use("/student/announcements", studentAnnouncementsRoutes);

app.use("/admin/forms", adminFormsRoutes);
app.use("/student/forms", studentFormsRoutes);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));

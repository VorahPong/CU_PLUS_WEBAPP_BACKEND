const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// health check (keep this)
app.get("/health", (req, res) => {
	res.json({ ok: true, message: "backend is running" });
});

// auth routes
const authRoutes = require("./api/auth.routes");
app.use("/auth", authRoutes);

// start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));

import { Router } from "express";

const router = Router();

router.get("/bot/status", (_req, res) => {
  res.json({ status: "running", mode: "long-polling" });
});

export default router;

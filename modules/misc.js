// modules/misc.js
const express = require("express");
const { requireAuth } = require("../utils/auth");

const router = express.Router();

router.get("/breeders", requireAuth, (req, res) => {
  res.send(`
    <h1>Breeders - CaTech System</h1>
    <p>Here we will manage Gatarina breeders.</p>
    <a href="/home">← Back</a>
  `);
});

router.get("/events", requireAuth, (req, res) => {
  res.send(`
    <h1>Events & Shows - CaTech System</h1>
    <p>Here we will manage shows, classes and entries.</p>
    <a href="/home">← Back</a>
  `);
});

router.get("/reports", requireAuth, (req, res) => {
  res.send(`
    <h1>Reports - CaTech System</h1>
    <p>Here we will generate statistics and reports.</p>
    <a href="/home">← Back</a>
  `);
});

router.get("/settings", requireAuth, (req, res) => {
  res.send(`
    <h1>Settings - CaTech System</h1>
    <p>Here we will configure system options and club preferences.</p>
    <a href="/home">← Back</a>
  `);
});

module.exports = router;

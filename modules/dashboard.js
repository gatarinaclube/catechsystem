// modules/dashboard.js
const express = require("express");
const prisma = require("../prismaClient");
const { requireAuth } = require("../utils/auth");

const router = express.Router();

router.get("/home", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
  });

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>CaTech System -Painel Principal</title>
  <style>
    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f5f7;
    }
    .layout {
      display: flex;
      height: 100vh;
    }
    .sidebar {
      width: 240px;
      background: #111827;
      color: #e5e7eb;
      display: flex;
      flex-direction: column;
      padding: 16px;
      box-sizing: border-box;
    }
    .sidebar h2 {
      font-size: 20px;
      margin: 0 0 24px 0;
      color: #f9fafb;
    }
    .sidebar small {
      display: block;
      color: #9ca3af;
      margin-bottom: 24px;
    }
    .nav-link {
      display: block;
      padding: 8px 12px;
      border-radius: 6px;
      text-decoration: none;
      color: #e5e7eb;
      margin-bottom: 4px;
      font-size: 14px;
    }
    .nav-link:hover {
      background: #1f2937;
    }
    .nav-link.active {
      background: #2563eb;
      color: #f9fafb;
    }
    .sidebar-footer {
      margin-top: auto;
      font-size: 12px;
      color: #6b7280;
    }

    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .topbar {
      height: 56px;
      background: #ffffff;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      box-sizing: border-box;
    }
    .topbar-title {
      font-weight: 600;
      font-size: 16px;
    }
    .topbar-user {
      font-size: 14px;
      color: #4b5563;
    }
    .topbar-user a {
      margin-left: 12px;
      text-decoration: none;
      color: #ef4444;
      font-weight: 500;
    }

    .content {
      padding: 24px;
      box-sizing: border-box;
      overflow-y: auto;
    }
    .content h1 {
      margin: 0 0 8px 0;
      font-size: 24px;
      color: #111827;
    }
    .content p {
      margin: 0 0 24px 0;
      color: #4b5563;
      font-size: 14px;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .card {
      background: #ffffff;
      border-radius: 10px;
      padding: 16px;
      box-sizing: border-box;
      border: 1px solid #e5e7eb;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }
    .card-title {
      font-size: 14px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    .card-value {
      font-size: 20px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 4px;
    }
    .card-sub {
      font-size: 12px;
      color: #9ca3af;
    }

    .section-title {
      margin-top: 32px;
      margin-bottom: 8px;
      font-size: 16px;
      font-weight: 600;
    }
    .section-box {
      background: #ffffff;
      border-radius: 10px;
      border: 1px solid #e5e7eb;
      padding: 16px;
      font-size: 14px;
      color: #4b5563;
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <h2>CaTech System</h2>
      <small>Gatarina Cat Club</small>

      <a href="/home" class="nav-link active">🏠 Painel Principal</a>
      <a href="/cats" class="nav-link">🐱 Meus Gatos</a>
      <a href="/breeders" class="nav-link">👤 Breeders</a>
      <a href="/events" class="nav-link">📅 Events & Shows</a>
      <a href="/reports" class="nav-link">📊 Reports</a>
      <a href="/settings" class="nav-link">⚙️ Settings</a>

      <div class="sidebar-footer">
        v0.1 · CaTech System
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="topbar-title">Painel Principal</div>
        <div class="topbar-user">
          Logged as <strong>${user.name}</strong>
          <a href="/logout">Logout</a>
        </div>
      </header>

      <main class="content">
        <h1>Welcome, ${user.name.split(" ")[0]}!</h1>
        <p>
          This is the main panel of <strong>CaTech System</strong>. Here you will manage
          cats, breeders, events and reports for Gatarina Cat Club.
        </p>

        <div class="cards">
          <div class="card">
            <div class="card-title">Registered cats</div>
            <div class="card-value">–</div>
            <div class="card-sub">Soon this will show real data.</div>
          </div>
          <div class="card">
            <div class="card-title">Active breeders</div>
            <div class="card-value">–</div>
            <div class="card-sub">Coming in the next modules.</div>
          </div>
          <div class="card">
            <div class="card-title">Upcoming events</div>
            <div class="card-value">–</div>
            <div class="card-sub">Connect CaTech with Gatarina shows.</div>
          </div>
        </div>

        <h2 class="section-title">Next steps</h2>
        <div class="section-box">
          • Create the <strong>cat module</strong> (registration, list, details).<br/>
          • Create the <strong>breeder module</strong> (Gatarina members, prefixes).<br/>
          • Create the <strong>event module</strong> (shows, classes, entries).<br/>
          • Add <strong>permissions / roles</strong> for admin, breeder, visitor.<br/>
        </div>
      </main>
    </div>
  </div>
</body>
</html>`);
});

module.exports = router;

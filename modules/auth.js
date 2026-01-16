// modules/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../prismaClient");

const router = express.Router();

// Página de cadastro
router.get("/register", (req, res) => {
  res.send(`
    <h1>CaTech System - Cadastro</h1>
    <form method="POST" action="/register">
      <label>Nome:</label><br/>
      <input type="text" name="name" required /><br/><br/>

      <label>E-mail:</label><br/>
      <input type="email" name="email" required /><br/><br/>

      <label>Senha:</label><br/>
      <input type="password" name="password" required /><br/><br/>

      <button type="submit">Cadastrar</button>
    </form>
    <p>Já tem conta? <a href="/login">Fazer login</a></p>
  `);
});

router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.send(`
        <p>Já existe um usuário com este e-mail.</p>
        <a href="/register">Voltar</a>
      `);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    req.session.userId = user.id;
    res.redirect("/home");
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao registrar usuário.");
  }
});

// Página de login
router.get("/login", (req, res) => {
  res.send(`
    <h1>CaTech System - Login</h1>
    <form method="POST" action="/login">
      <label>E-mail:</label><br/>
      <input type="email" name="email" required /><br/><br/>

      <label>Senha:</label><br/>
      <input type="password" name="password" required /><br/><br/>

      <button type="submit">Entrar</button>
    </form>
    <p>Não tem conta? <a href="/register">Cadastre-se</a></p>
  `);
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.send(`
        <p>Usuário ou senha inválidos.</p>
        <a href="/login">Tentar novamente</a>
      `);
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.send(`
        <p>Usuário ou senha inválidos.</p>
        <a href="/login">Tentar novamente</a>
      `);
    }

    req.session.userId = user.id;
    res.redirect("/home");
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao fazer login.");
  }
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    res.redirect("/login");
  });
});

module.exports = router;

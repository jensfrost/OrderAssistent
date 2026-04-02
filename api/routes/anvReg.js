// routes/anvReg.js
const express = require('express');
const router  = express.Router();
const { AnvReg } = require('../models');

// GET all users
router.get('/', async (req, res) => {
  res.json(await AnvReg.findAll());
});

// GET by PK ANANVN
router.get('/:ANANVN', async (req, res) => {
  const u = await AnvReg.findByPk(+req.params.ANANVN);
  if (!u) return res.status(404).json({ message: 'Not Found' });
  res.json(u);
});

// POST create
router.post('/', async (req, res) => {
  try {
    const newU = await AnvReg.create({
      // ANANVN: sätt inte om kolumnen är identity/autoincrement
      ANMAIL: req.body.ANMAIL,
      ANPASS: req.body.ANPASS,   // se till att du hashar på serversidan!
      ANROLE: req.body.ANROLE,   // <-- lägg till denna
    });
    res.status(201).json(newU);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT update
router.put('/:ANANVN', async (req, res) => {
  const [updated] = await AnvReg.update(req.body, {
    where: { ANANVN: +req.params.ANANVN }
  });
  if (!updated) return res.status(404).json({ message: 'Not Found' });
  res.json(await AnvReg.findByPk(+req.params.ANANVN));
});

// DELETE
router.delete('/:ANANVN', async (req, res) => {
  const deleted = await AnvReg.destroy({ where: { ANANVN: +req.params.ANANVN } });
  if (!deleted) return res.status(404).json({ message: 'Not Found' });
  res.status(204).send();
});

module.exports = router;

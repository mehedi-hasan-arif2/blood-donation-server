const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI, { serverApi: { version: ServerApiVersion.v1 } });

async function run() {
  await client.connect();
  const usersCollection = client.db("bloodDonationDB").collection("users");

  app.post('/jwt', async (req, res) => {
    const token = jwt.sign(req.body, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
    res.send({ token });
  });

  app.post('/register', async (req, res) => {
    const existing = await usersCollection.findOne({ email: req.body.email });
    if (existing) return res.send({ message: 'User already exists' });
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const result = await usersCollection.insertOne({ ...req.body, password: hashedPassword, role: 'donor', status: 'active' });
    res.send(result);
  });
}
run();
app.listen(5000);
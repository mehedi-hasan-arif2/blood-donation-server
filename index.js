const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const port = process.env.PORT || 5000;
const verifyToken = require('./middlewares/verifyToken');
const verifyAdmin = require('./middlewares/verifyAdmin');
const verifyVolunteer = require('./middlewares/verifyVolunteer');

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI, { serverApi: { version: ServerApiVersion.v1 } });

async function run() {
  await client.connect();
  const db = client.db("bloodDonationDB");
  const usersCollection = db.collection("users");
  const donationRequestsCollection = db.collection("donationRequests");

  // Auth & Register
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

  // User Mgmt & Middlewares
  app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const users = await usersCollection.find().skip((page - 1) * limit).limit(parseInt(limit)).toArray();
    const total = await usersCollection.countDocuments();
    res.send({ users, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  });

  // Donation Request Endpoints (Create & Get)
  app.post('/donation-requests', verifyToken, async (req, res) => {
    const user = await usersCollection.findOne({ email: req.decoded.email });
    if (user?.status === 'blocked') return res.status(403).send({ message: 'User blocked' });
    const result = await donationRequestsCollection.insertOne({ ...req.body, status: 'pending', createdAt: new Date() });
    res.send(result);
  });

  app.get('/donation-requests', async (req, res) => {
    const { status, page = 1, limit = 10 } = req.query;
    const query = status ? { status } : {};
    const result = await donationRequestsCollection.find(query).skip((parseInt(page) - 1) * parseInt(limit)).limit(parseInt(limit)).toArray();
    const total = await donationRequestsCollection.countDocuments(query);
    res.send({ data: result, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  });
}
run();
app.listen(port);
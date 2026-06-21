const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const port = process.env.PORT || 5000;

// Middlewares
const verifyToken = require('./middlewares/verifyToken');
const verifyAdmin = require('./middlewares/verifyAdmin');
const verifyVolunteer = require('./middlewares/verifyVolunteer');

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI, { 
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } 
});

async function run() {
  await client.connect();
  const db = client.db("bloodDonationDB");
  const usersCollection = db.collection("users");
  const donationRequestsCollection = db.collection("donationRequests");
  const fundingsCollection = db.collection("fundings");

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

  app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const users = await usersCollection.find().skip((page - 1) * limit).limit(limit).toArray();
    const total = await usersCollection.countDocuments();
    res.send({ users, total, page, totalPages: Math.ceil(total / limit) });
  });

  app.get('/donation-requests', async (req, res) => {
    const { status, page = 1, limit = 10 } = req.query;
    const query = status ? { status } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const result = await donationRequestsCollection.find(query).skip(skip).limit(parseInt(limit)).toArray();
    const total = await donationRequestsCollection.countDocuments(query);
    res.send({ data: result, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  });

  app.post('/donation-requests', verifyToken, async (req, res) => {
    const result = await donationRequestsCollection.insertOne({ ...req.body, status: 'pending', createdAt: new Date() });
    res.send(result);
  });

  app.delete('/donation-requests/:id', verifyToken, async (req, res) => {
    const result = await donationRequestsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  });

  app.patch('/donation-requests/update/:id', verifyToken, async (req, res) => {
    const result = await donationRequestsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: req.body.status } }
    );
    res.send(result);
  });

  /* ---  SEARCH DONORS --- */
  app.get('/search-donors', async (req, res) => {
    const result = await usersCollection.find({ ...req.query, status: 'active' }).toArray();
    res.send(result);
  });

  /* --- ADMIN STATS DASHBOARD --- */
  app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
    const totalUsers = await usersCollection.estimatedDocumentCount();
    const totalRequests = await donationRequestsCollection.estimatedDocumentCount();
    const totalFunding = await fundingsCollection.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]).toArray();
    res.send({ totalUsers, totalRequests, totalFunding: totalFunding[0]?.total || 0 });
  });

  await client.db("admin").command({ ping: 1 });
  console.log("MongoDB connected successfully!");
}
run();
app.listen(port);
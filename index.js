const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bcrypt = require('bcryptjs');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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

  // (User, Request, Delete, Update, Search, Stats
  app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
    const totalUsers = await usersCollection.estimatedDocumentCount();
    const totalRequests = await donationRequestsCollection.estimatedDocumentCount();
    const totalFunding = await fundingsCollection.aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]).toArray();
    res.send({ totalUsers, totalRequests, totalFunding: totalFunding[0]?.total || 0 });
  });

  /* ---  STRIPE PAYMENT AND FUNDING --- */
  app.post('/create-payment-intent', verifyToken, async (req, res) => {
    const { price } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: parseInt(price * 100),
      currency: 'usd',
      payment_method_types: ['card']
    });
    res.send({ clientSecret: paymentIntent.client_secret });
  });

  app.post('/fundings', verifyToken, async (req, res) => {
    const result = await fundingsCollection.insertOne(req.body);
    res.send(result);
  });

  app.get('/fundings', verifyToken, verifyAdmin, async (req, res) => {
    const result = await fundingsCollection.find().toArray();
    res.send(result);
  });

  await client.db("admin").command({ ping: 1 });
  console.log("MongoDB connected successfully!");
}
run();
app.listen(port);
const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); 
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

// Middlewares
const verifyToken = require('./middlewares/verifyToken');
const verifyAdmin = require('./middlewares/verifyAdmin');
const verifyVolunteer = require('./middlewares/verifyVolunteer');

app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

async function run() {
  try {
    await client.connect();

    const db = client.db("bloodDonationDB");
    const usersCollection = db.collection("users");
    const donationRequestsCollection = db.collection("donationRequests");
    const fundingsCollection = db.collection("fundings");

    // --- JWT API ---
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    // --- User APIs ---
    app.post('/register', async (req, res) => {
      const userData = req.body;
      const query = { email: userData.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) return res.send({ message: 'User already exists', insertedId: null });
      const newUser = { ...userData, role: 'donor', status: 'active' };
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.patch('/users/update/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role, status } = req.body;
      const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { role, status } });
      res.send(result);
    });

    app.patch('/users/profile/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const updatedData = req.body;
      const result = await usersCollection.updateOne({ email }, { $set: updatedData });
      res.send(result);
    });

    // --- Donation Request APIs ---
    app.post('/donation-requests', verifyToken, async (req, res) => {
      const requestData = req.body;
      const newRequest = { ...requestData, status: 'pending' };
      const result = await donationRequestsCollection.insertOne(newRequest);
      res.send(result);
    });

    app.get('/donation-requests', async (req, res) => {
      const result = await donationRequestsCollection.find().toArray();
      res.send(result);
    });

    app.get('/donation-requests/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await donationRequestsCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.get('/my-donation-requests/:email', verifyToken, async (req, res) => {
      const result = await donationRequestsCollection.find({ requesterEmail: req.params.email }).toArray();
      res.send(result);
    });

    app.delete('/donation-requests/:id', verifyToken, async (req, res) => {
      const result = await donationRequestsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    app.patch('/donation-requests/update/:id', verifyToken, async (req, res) => {
      const result = await donationRequestsCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: req.body.status } });
      res.send(result);
    });

    // --- Search & Stats APIs ---
    app.get('/search-donors', async (req, res) => {
      const { bloodGroup, district, upazila } = req.query;
      const result = await usersCollection.find({ bloodGroup, district, upazila }).toArray();
      res.send(result);
    });

    app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
      const totalUsers = await usersCollection.estimatedDocumentCount();
      const totalRequests = await donationRequestsCollection.estimatedDocumentCount();
      const totalFunding = await fundingsCollection.aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]).toArray();
      res.send({ totalUsers, totalRequests, totalFunding: totalFunding[0]?.total || 0 });
    });

    // --- Stripe Payment API ---
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
      const funding = req.body;
      const result = await fundingsCollection.insertOne(funding);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB successfully!");
  } catch (error) {
    console.error("DB connection error:", error);
  }
}
run();

app.get('/', (req, res) => res.send('Blood Donation Server is running'));
app.listen(port, () => console.log(`Server listening on port ${port}`));
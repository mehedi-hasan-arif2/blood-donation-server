const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bcrypt = require('bcryptjs');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 5000;

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

    /* REGISTER */
    app.post('/register', async (req, res) => {
      const existing = await usersCollection.findOne({ email: req.body.email });
      if (existing) return res.send({ message: 'User already exists' });

      const hashedPassword = await bcrypt.hash(req.body.password, 10);

      const newUser = {
        ...req.body,
        password: hashedPassword,
        role: 'donor',
        status: 'active'
      };

      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    /* LOGIN */
    app.post("/login", async (req, res) => {
      const { email, password } = req.body;

      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(401).send({ message: "User not found" });
      }

      if (user.status === "blocked") {
        return res.status(403).send({ message: "User is blocked" });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.status(401).send({ message: "Wrong password" });
      }

      const token = jwt.sign(
        {
          email: user.email,
          role: user.role,
        },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );

      res.send({
        token,
        user: {
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
        },
      });
    });

    /* USERS - PAGINATION */
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const skip = (page - 1) * limit;

      const users = await usersCollection.find()
        .skip(skip)
        .limit(limit)
        .toArray();

      const total = await usersCollection.countDocuments();

      res.send({
        users,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      });
    });

    /* USERS UPDATE */
    app.patch('/users/update/:id', verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: req.body }
      );
      res.send(result);
    });

    /* PROFILE UPDATE */
    app.patch('/users/profile/:email', verifyToken, async (req, res) => {
      if (req.decoded.email !== req.params.email) {
        return res.status(403).send({ message: 'Forbidden' });
      }

      const result = await usersCollection.updateOne(
        { email: req.params.email },
        { $set: req.body }
      );

      res.send(result);
    });

    /* DONATION REQUEST CREATE */
    app.post('/donation-requests', verifyToken, async (req, res) => {
      const user = await usersCollection.findOne({ email: req.decoded.email });

      if (user?.status === 'blocked') {
        return res.status(403).send({ message: 'User blocked' });
      }

      const result = await donationRequestsCollection.insertOne({
        ...req.body,
        status: 'pending',
        createdAt: new Date()
      });

      res.send(result);
    });

    /* DONATION REQUESTS */
    app.get('/donation-requests', async (req, res) => {
      const { status, page = 1, limit = 10 } = req.query;

      const query = {};
      if (status) query.status = status;

      const skip = (page - 1) * limit;

      const result = await donationRequestsCollection.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      const total = await donationRequestsCollection.countDocuments(query);

      res.send({
        data: result,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit)
      });
    });

    /* SINGLE REQUEST */
    app.get('/donation-requests/:id', verifyToken, async (req, res) => {
      const result = await donationRequestsCollection.findOne({
        _id: new ObjectId(req.params.id)
      });
      res.send(result);
    });

    /* MY REQUESTS */
    app.get('/my-donation-requests', verifyToken, async (req, res) => {
      const result = await donationRequestsCollection
        .find({ requesterEmail: req.decoded.email })
        .toArray();

      res.send(result);
    });

    /* RECENT REQUESTS */
    app.get('/donation-requests/recent', verifyToken, async (req, res) => {
      const result = await donationRequestsCollection
        .find({ requesterEmail: req.decoded.email })
        .sort({ createdAt: -1 })
        .limit(3)
        .toArray();

      res.send(result);
    });

    /* DELETE */
    app.delete('/donation-requests/:id', verifyToken, async (req, res) => {
      const result = await donationRequestsCollection.deleteOne({
        _id: new ObjectId(req.params.id)
      });

      res.send(result);
    });

    /* EDIT REQUEST */
    app.patch('/donation-requests/edit/:id', verifyToken, async (req, res) => {
      const result = await donationRequestsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        {
          $set: {
            recipientName: req.body.recipientName,
            recipientDistrict: req.body.recipientDistrict,
            recipientUpazila: req.body.recipientUpazila,
            hospitalName: req.body.hospitalName,
            fullAddress: req.body.fullAddress,
            bloodGroup: req.body.bloodGroup,
            donationDate: req.body.donationDate,
            donationTime: req.body.donationTime,
            requestMessage: req.body.requestMessage
          }
        }
      );

      res.send(result);
    });

    /* UPDATE STATUS */
    app.patch('/donation-requests/update/:id', verifyToken, async (req, res) => {
      const result = await donationRequestsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: req.body }
      );

      res.send(result);
    });

    /* SEARCH DONORS (SAFE) */
    app.get('/search-donors', async (req, res) => {
      const { bloodGroup, district, upazila } = req.query;

      const query = { status: 'active' };

      if (bloodGroup) query.bloodGroup = bloodGroup;
      if (district) query.district = district;
      if (upazila) query.upazila = upazila;

      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    /* ADMIN STATS */
    app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
      const totalUsers = await usersCollection.estimatedDocumentCount();
      const totalRequests = await donationRequestsCollection.estimatedDocumentCount();

      const totalFunding = await fundingsCollection.aggregate([
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]).toArray();

      res.send({
        totalUsers,
        totalRequests,
        totalFunding: totalFunding[0]?.total || 0
      });
    });

    /* STRIPE */
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(req.body.price * 100),
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

  } catch (err) {
    console.error(err);
  }
}

run();

app.get('/', (req, res) => {
  res.send('Blood Donation Server Running');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
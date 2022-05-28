const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qo56q2b.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('computer_manufacturer').collection('services');
        const bookingCollection = client.db('computer_manufacturer').collection('bookings');
        const userCollection = client.db('computer_manufacturer').collection('users');
        const reviewCollection = client.db('computer_manufacturer').collection('review');
        const paymentCollection = client.db('computer_manufacturer').collection('payments');
        const profileCollection = client.db('computer_manufacturer').collection('profile');

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }
        //

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const pay = req.body;
            const price = pay.totalPrice;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services);
        });

        app.get('/profile/:id', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services);
        });

        app.post('/service', verifyJWT, verifyAdmin, async (req, res) => {
            const service = req.body;
            const result = await serviceCollection.insertOne(service);
            res.send(result);
        });

        app.post('/profile', verifyJWT, async (req, res) => {
            const profile = req.body;
            const result = await profileCollection.insertOne(profile);
            res.send(result);
        });

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });



        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' })
            res.send({ result, token });
        });

        // get all services
        app.get('/available', async (req, res) => {
            const query = {};
            const services = await serviceCollection.find(query).toArray();
            res.send(services);
        })


        app.get('/booking', verifyJWT, async (req, res) => {
            const bookingMail = req.query.bookingMail;
            const decodedEmail = req.decoded.email;
            if (bookingMail === decodedEmail) {
                const query = { bookingMail: bookingMail };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'forbidden access' });
            }
        });

        //This is one is for payment
        app.get('/paybooking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
        });

        //This one is for rest of bookings
        app.get('/booking/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await serviceCollection.findOne(query);
            res.send(booking);
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            // const query = { product: booking.product, date: booking.date, bookingMail: booking.bookingMail }
            // const exists = await bookingCollection.findOne(query);
            // if (exists) {
            //     return res.send({ success: false, booking: exists })
            // }
            const result = await bookingCollection.insertOne(booking);
            // return res.send({ success: true, result });
            res.send(result);
        });

        app.patch('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }

            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
            res.send(updatedBooking);
        });


        app.get('/review', async (req, res) => {
            const review = await reviewCollection.find().toArray();
            res.send(review);
        })

        app.post('/review', verifyJWT, async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        });

        app.delete('/review/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const result = await reviewCollection.deleteOne(filter);
            res.send(result);
        });

        app.delete('/booking/:bookingMail', verifyJWT, async (req, res) => {
            const email = req.params.bookingMail;
            const filter = { bookingMail: email };
            const result = await bookingCollection.deleteOne(filter);
            res.send(result);
        });

        // app.delete('/booking/:id', verifyJWT, async (req, res) => {
        //     const id = req.params.id;
        //     const filter = { _id: id };
        //     const result = await bookingCollection.deleteOne(filter);
        //     res.send(result);
        // })

    }
    finally {

    }
}

run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('The Server is Ready for Computer Manufacturer.')
})

app.listen(port, () => {
    console.log(`Listening on port ${port}`)
})
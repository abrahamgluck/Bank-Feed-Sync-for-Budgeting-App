const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();

app.use(express.json());

const PLAID_BASE_URL = 'https://sandbox.plaid.com';

app.get('/plaid/generate-access-token', async (req, res) => {
  try {
    /* === Generate Link Token === */
    const responseToken = await axios.post(`${PLAID_BASE_URL}/link/token/create`, {
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      client_name: 'QalbIT App',
      language: 'en',
      country_codes: ['US'],
      user: {
        client_user_id: 'qalbit-user-001'
      },
      products: ['transactions']
    });
    const linkToken = responseToken.data?.link_token;

    /* === Create a Public Token === */
    const responsePublicToken = await axios.post(`${PLAID_BASE_URL}/sandbox/public_token/create`, {
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      institution_id: "ins_109508",
      initial_products: ['transactions']
    });
    const publicToken = responsePublicToken.data?.public_token;

    /* === Exchange Public Token - Access Token === */
    const responseExchangeToken = await axios.post(`${PLAID_BASE_URL}/item/public_token/exchange`, {
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      public_token: publicToken
    });
    const accessToken = responseExchangeToken.data?.access_token;

    res.json({
      public_token: publicToken,
      access_token: accessToken
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate access_token' });
  }
});

app.post('/plaid/transactions', async (req, res) => {
  const { access_token, start_date, end_date } = req.body;
  
  if (!access_token) {
    return res.status(400).json({ error: 'access_token is required' });
  }

  if (!start_date) {
    return res.status(400).json({ error: 'start_date is required' });
  }

  if (!end_date) {
    return res.status(400).json({ error: 'end_date is required' });
  }

  try {
    const response = await axios.post(`${PLAID_BASE_URL}/transactions/get`, {
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      access_token,
      start_date,
      end_date
    });

    res.json(response.data);

  } catch (error) {
    console.error('Get Transactions Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Could not fetch transactions' });
  }
});

module.exports = app;

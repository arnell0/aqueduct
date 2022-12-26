const express = require('express');
const app = express();
const dotenv = require('dotenv');
const cors = require('cors');
const axios = require('axios');

function log(text, file='log.txt') {
    const fs = require('fs');

    let date = new Date();
    let timestamp = date.toISOString();

    let log = `${timestamp}: ${text}\n`;

    // if log.txt does not exist, create it
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, log);
    } else {
        // if log.txt is to big, delete it
        let stats = fs.statSync(file);
        let fileSizeInBytes = stats.size;
        if (fileSizeInBytes > 1000000) {
            fs.unlinkSync(file);
            fs.writeFileSync(file, log);
        } else {
            // append to log.txt
            fs.appendFileSync(file, log);
        }
    }
    
    console.log(log);
}
function dump_json_to_file(data, file='tmp/dump.txt') {
    const fs = require('fs');

    if (!fs.existsSync('tmp')) {
        fs.mkdirSync('tmp');
    }

    // format data 
    let stringifiedData = JSON.stringify(data, null, 2);
    fs.writeFileSync(file, stringifiedData);
}

dotenv.config();

// database
const { db } = require('./db');
db.init();


// Middleware
app.use(express.json());  
app.use(cors());


// Routes
// const oauthRoute = require('./routes/oauth');
// app.use('/api/oauth', oauthRoute);


let port = 1000
app.listen(port, () => {
  console.log(`Server started on port: ${port} and serving files from build`)
});

app.get("/", (req, res) => {
    res.send("Hello World")
});




// OATH --------------------------------------------------------------------------------------------
// https://arnell.xyz/aq/api/activation?code={Authorization-Code}&state=somestate123

// function to throttle requests to the API to avoid rate limiting, rate_limit is the number of requests per second, rate_limit=5 means 5 requests per second
function throttle(rate_limit) {
    let last_request = 0;
    return function() {
        let now = Date.now();
        let time_since_last_request = now - last_request;
        let time_to_wait = 1000 / rate_limit - time_since_last_request;
        if (time_to_wait > 0) {
            return new Promise(resolve => setTimeout(resolve, time_to_wait));
        }
        last_request = now;
    }
}
let throttled = throttle(4);

async function getAccessToken(query) {
    log('getAccessToken()')
    // Get Access-Token
    // Authorization-Code and your Client-Secret can then be used to request an Accestoken
    // URL: POST https://apps.fortnox.se/oauth-v1/token
    // Headers:
    // CREDENTIALS is the Base64 encoding of ClientId and Client-Secret, separated with a colon.
    // Example:
    // ClientId: 8VurtMGDTeAI
    // ClientSecret: yFKwme8LEQ
    // Credentials: OFZ1cnRNR0RUZUFJOnlGS3dtZThMRVE=
    // Content-type: application/x-www-form-urlencoded
    // Authorization: Basic {Credentials}
    // Body:
    // grant_type=authorization_code&code={Authorization-Code}&redirect_uri=https://mysite.org/activation
    // Response:
    // {
    //   "access_token": "xyz...",
    //   "refresh_token": "a7302e6b-b1cb-4508-b884-cf9abd9a51de",
    //   "scope": "companyinformation",
    //   "expires_in": 3600,
    //   "token_type": "Bearer"
    // }
    let authorization_code = query.code;
    let state = query.state;
    
    const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI} = process.env; 
    
    const url = 'https://apps.fortnox.se/oauth-v1/token';

    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    log(authorization_code)
    log(credentials)

    const body = {
        grant_type: 'authorization_code',
        code: authorization_code,
        redirect_uri: REDIRECT_URI
    }   

    const config = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`
        }
    }

    let response = await axios.post(url, body, config)
    let data = response.data;

    data.expires_at = Date.now() + data.expires_in * 1000;
    
    let stringifiedData = JSON.stringify(data);
    
    let key = `oauth-response-${state}`;
    await db.store.set(key, stringifiedData);
}
async function refreshAccessToken(user_id) {
    log('refreshAccessToken(): ' + user_id)

    // Refresh Access-Token
    // POST https://apps.fortnox.se/oauth-v1/token
    // Headers:
    // Content-type: application/x-www-form-urlencoded
    // Authorization: Basic {Credentials}
    // Body:
    // grant_type=refresh_token&refresh_token={Refresh-Token}
    // Response:
    // {
    // "access_token": "xyz...",
    // "refresh_token": "a7302e6b-b1cb-4508-b884-cf9abd9a51de",
    // "scope": "companyinformation",
    // "expires_in": 3600,
    // "token_type": "Bearer"
    // }


    let key = `oauth-response-${user_id}`;
    let oauth_response = await db.store.get(key);
    oauth_response = JSON.parse(oauth_response);

    const { CLIENT_ID, CLIENT_SECRET } = process.env;
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    const body = {
        grant_type: 'refresh_token',
        refresh_token: oauth_response.refresh_token
    }

    config = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`
        }
    }

    response = await axios.post('https://apps.fortnox.se/oauth-v1/token', body, config)
    let data = response.data;
    data.expires_at = Date.now() + data.expires_in * 1000;
    let stringifiedData = JSON.stringify(data);

    await db.store.set(key, stringifiedData);

    return data;
}
async function getApiRoute(route, user_id) {
    // API CALLS ---------------------------------------------------------------------------------------
    // GET https://api.fortnox.se/3/companyinformation
    // Headers
    // Authorization: Bearer {Access-Token}
    //-H "Content-Type: application/json" -H "Accept: application/json"
    const run = async (access_token) => {
        let config = {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        }
    
        await throttled();

        let response = await axios.get(`https://api.fortnox.se/3/${route}/3`, config)
        console.log(response.status)
        dump_json_to_file(response.data)
        return response
    }

    let key = `oauth-response-${user_id}`;
    let oauth_response = await db.store.get(key);
    oauth_response = JSON.parse(oauth_response);

    // oauth_response.expires_at = Date.now() + oauth_response.expires_in * 1000;

    // if (Date.now() > oauth_response.expires_at - 1000) {
    //     oauth_response = await refreshAccessToken(user_id);
    // }

    let response = await run(oauth_response.access_token);
    if (response.status === 200) {
        return response.data3600
    }

    oauth_response = await refreshAccessToken();    
    response = await run(oauth_response.access_token);
    return response.data
}
app.get("/api/oauth/activation", (req, res) => {
    // req.query.state = user_id = 1234
    getAccessToken(req.query);
    // res.redirect('/');
    res.sendStatus(200)
});
app.get("/api/orders", async (req, res) => {
    // http://arnell.xyz:1000/api/orders?user_id=1
    let user_id = req.query.user_id;
    let data = await getApiRoute('orders', user_id);
    res.send(data);
});

  
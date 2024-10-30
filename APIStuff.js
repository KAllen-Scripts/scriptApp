let accessToken = null;
let tokenExpirationTime = null;

function generateSignature(accountKey, clientId, secretKey) {
    const hash = crypto.createHmac('sha256', secretKey).update(`${clientId}`).digest('hex');
    return hash;
}

async function getAccessToken() {
    try {
        const signature = generateSignature(accountKey, clientId, secretKey);

        const response = await axios.post(`https://${enviroment}/v1/grant`, {
            accountkey: accountKey,
            clientId: clientId,
            signature: signature
        });

        accessToken = response.data.data.authenticationResult.accessToken;

        // Parse the ISO string into a timestamp
        const expiryTime = new Date(response.data.data.authenticationResult.expiry).getTime();

        // Set tokenExpirationTime to the actual expiry time
        tokenExpirationTime = expiryTime;
    } catch (error) {
        console.error("Error fetching access token:", error);
        throw error;
    }
}

async function ensureToken() {
    if (!accessToken || Date.now() >= tokenExpirationTime) {
        await getAccessToken();
    }
}

async function requester(method, url, data, retry = 3) {
    // Ensure we have a valid token
    await ensureToken();

    while (tokens <= 0) {
        await sleep(100);
    }
    tokens -= 1;

    const request = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken // Use Bearer token for secure auth
        },
        url: url,
        data: data
    };

    let response = await axios(request)
        .then(r => r.data)
        .catch(async e => {
            if (retry <= 0) {
                console.error(`HTTP error! Status: ${e.response.status}`);
                return new Error(`HTTP error! Status: ${e.response.status}`);
            } else {
                // Try again with a new token if necessary
                await ensureToken();
                return requester(method, url, data, retry - 1);
            }
        });

    return response;
}

async function loopThrough(url, params, filter, callBack) {
    let total;
    let page = 0;
    let count = 0;
    do {
        let res = await requester('get', `${url}?${params}&page=${page}&filter=${filter}`);
        total = res.metadata.count;

        var length = res.data.length;
        page += 1;
        for (const item of res.data) {
            await callBack(item);
            count += 1;
        }
    } while (length > 0);
}

document.addEventListener('DOMContentLoaded', function() {
    replenTokens();
    getAccessToken();
});

async function replenTokens(){
    do {
        tokens = maxTokensToHold;
        await sleep(60000/(tokensOverMinute/maxTokensToHold));
    } while (true);
}

function getFileByFTP(ftpInputs, username, password) {
    address = ftpInputs.address;
    port = ftpInputs.port;
    filepath = ftpInputs.filepath;
    return new Promise((resolve, reject) => {
      const client = new ftp();
  
      client.on('ready', () => {
        client.get(filepath, (err, stream) => {
          if (err) {
            client.end();
            return reject(err);
          }
  
          let fileData = '';
          const writableStream = new Writable({
            write(chunk, encoding, callback) {
              fileData += chunk.toString();
              callback();
            }
          });
  
          stream.pipe(writableStream);
  
          stream.on('end', () => {
            client.end();
            resolve(fileData);
          });
  
          stream.on('error', (err) => {
            client.end();
            reject(err);
          });
        });
      });
  
      client.on('error', (err) => {
        reject(err);
      });
  
      client.connect({
        host: address,
        port: port,
        user: username,
        password: password
      });
    });
}

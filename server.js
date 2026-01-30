require('dotenv').config();
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const keyManager = require('./lib/keyGenerator');

const app = express();
const PORT = process.env.SERVER_PORT || 3000;
const SITE_DNS = process.env.SITE_DNS || 'http://localhost';

// Store presentation requests
const presentationRequests = new Map();

// Store credentials in memory (pour le POC)
const credentialsStore = [
  {
    id: "0",
    type: 'PID',
    format: 'dc+sd-jwt',
    description: 'Personal Identification Credential',
    vct_values: ['urn:eudi:pid:1'],
    claims: [
      { path: ['family_name'], id: 'family_name' },
      { path: ['given_name'], id: 'given_name' }
    ]
  },
  {
    id: "1",
    type: 'PersonalData',
    format: 'dc+sd-jwt',
    description: 'Credential personnalisé pour la démonstration',
    vct_values: ['urn:custom:personaldata:1'],
    claims: [
      { path: ['custom_data'], id: 'custom_data' },
      { path: ['department'], id: 'department' },
      { path: ['role'], id: 'role' }
    ]
  }
];

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware de logging
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Intercepter la réponse
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    console.log(`\n📍 [${new Date().toISOString()}]`);
    console.log(`   Méthode: ${req.method}`);
    console.log(`   Path: ${req.path}`);
    if (Object.keys(req.body).length > 0) {
      console.log(`   Payload: ${JSON.stringify(req.body).substring(0, 200)}${JSON.stringify(req.body).length > 200 ? '...' : ''}`);
    }
    console.log(`   Status: ${statusCode}`);
    console.log(`   Durée: ${duration}ms`);
    
    originalSend.call(this, data);
  };
  
  next();
});

// Route racine
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Récupérer tous les credentials
app.get('/api/credentials', (req, res) => {
  res.json(credentialsStore);
});

// API: Créer une presentation request
app.post('/api/presentation-request', (req, res) => {
  const dcql = req.body;
  
  if (!dcql || !dcql.credentials || !Array.isArray(dcql.credentials)) {
    return res.status(400).json({ error: 'DCQL avec credentials requis' });
  }
  
  const requestId = uuidv4();
  const presentationRequestUrl = `${SITE_DNS}/presentation-request/${requestId}`;
  
  // Stocker la DCQL pour la récupération ultérieure
  presentationRequests.set(requestId, {
    dcql,
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000 // 1 heure
  });
  
  res.json({
    requestId,
    presentationRequestUrl,
    dcql
  });
});

// API: Récupérer le vp_token pour une presentation request
app.get('/presentation-request/:requestId', (req, res) => {
  const { requestId } = req.params;
  const presentationRequest = presentationRequests.get(requestId);
  
  if (!presentationRequest) {
    return res.status(404).json({ error: 'Presentation request not found' });
  }
  
  if (presentationRequest.expiresAt < Date.now()) {
    presentationRequests.delete(requestId);
    return res.status(410).json({ error: 'Presentation request expired' });
  }
  
  try {
    const nonce = uuidv4().replace(/-/g, '_');
    const state = uuidv4().replace(/-/g, '_');
    const hostname = req.hostname;
    
    const payload = {
      response_type: 'vp_token',
      client_id: hostname,
      response_uri: `https://${hostname}/presentation-request/${requestId}/authorize?session=${requestId}`,
      response_mode: 'direct_post',
      nonce: nonce,
      dcql_query: presentationRequest.dcql,
      client_metadata: {
        vp_formats_supported: {
          'dc+sd-jwt': {
            'sd-jwt_alg_values': ['ES256', 'ES384', 'EdDSA', 'Ed25519', 'ES256K'],
            'kb-jwt_alg_values': ['ES256', 'ES384', 'EdDSA', 'Ed25519', 'ES256K']
          }
        },
        logo_uri: `https://${hostname}/logo.png`,
        client_name: 'OpenID4VP Verifier',
        response_types_supported: ['vp_token']
      },
      state: state,
      aud: `https://${hostname}/presentation-request/${requestId}`,
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 heure
      iat: Math.floor(Date.now() / 1000)
    };
    
    // Extraire le certificat
    const certLines = keyManager.cert.split('\n');
    const certBody = certLines
      .filter(line => line && !line.includes('-----'))
      .join('');
    
    const vpToken = jwt.sign(payload, keyManager.privateKey, {
      algorithm: 'ES256',
      header: {
        typ: 'oauth-authz-req+jwt',
        x5c: [certBody]
      }
    });
    
    // Vérifier si le paramètre debug est présent
    const isDebug = req.query.debug === 'true' || req.query.debug === '1';
    
    if (isDebug) {
      // Mode debug: retourner le JSON avec le token et le payload en clair
      res.json({
        vp_token: vpToken,
        payload_decoded: payload
      });
    } else {
      // Mode normal: retourner juste le token brut
      res.type('text/plain');
      res.send(vpToken);
    }
  } catch (error) {
    console.error('Erreur lors de la génération du vp_token:', error);
    res.status(500).json({ error: 'Erreur lors de la génération du vp_token' });
  }
});

// API: Générer un QR code
app.post('/api/qrcode', async (req, res) => {
  const { text } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Text requis' });
  }
  
  try {
    const qrCodeImage = await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.95,
      margin: 2,
      width: 300
    });
    
    res.json({ qrCode: qrCodeImage });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la génération du QR code' });
  }
});

// Démarrer le serveur${SITE_DNS}
app.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});

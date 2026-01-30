const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const keysDir = path.join(__dirname, '..', 'keys');

// Créer le répertoire des clés s'il n'existe pas
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

const privateKeyPath = path.join(keysDir, 'private-key.pem');
const publicKeyPath = path.join(keysDir, 'public-key.pem');
const certPath = path.join(keysDir, 'certificate.pem');

// Vérifier si les clés existent déjà
if (fs.existsSync(privateKeyPath) && fs.existsSync(certPath)) {
  console.log('✓ Les clés et certificats existent déjà');
  module.exports = {
    privateKey: fs.readFileSync(privateKeyPath, 'utf8'),
    publicKey: fs.readFileSync(publicKeyPath, 'utf8'),
    cert: fs.readFileSync(certPath, 'utf8')
  };
} else {
  console.log('Génération des clés et certificats ECDSA ES256...');
  
  try {
    // Générer une paire de clés ECDSA avec la courbe P-256
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    // Écrire la clé privée d'abord
    fs.writeFileSync(privateKeyPath, privateKey);
    fs.writeFileSync(publicKeyPath, publicKey);

    // Créer un certificat auto-signé avec openssl si disponible
    let certContent;
    try {
      const { execSync } = require('child_process');
      const subject = '/CN=OpenID4VP Verifier/O=OpenID POC/C=FR';
      const opensslCmd = `openssl req -new -x509 -key "${privateKeyPath}" -out "${certPath}" -days 3650 -subj "${subject}"`;
      execSync(opensslCmd, { stdio: 'pipe', encoding: 'utf8' });
      certContent = fs.readFileSync(certPath, 'utf8');
      console.log('✓ Certificat généré avec openssl');
    } catch (e) {
      // Fallback: créer un certificat minimal en PEM
      console.log('⚠ openssl non disponible, utilisation d\'un certificat minimal');
      certContent = `-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJAKHHIG9ZC7VKMA0GCSqGSIb3DQEBBQUAMBMxETAPBgNVBAMMCG9w
ZW5pZDRWUDAeFw0yNTAxMzAxMjAwMDBaFw0zNTAxMjgxMjAwMDBaMBMxETAPBgNV
BAMMCG9wZW5pZDRWUDBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABCn0EbPsURxX
AgCEHJxvdp4RCwvIBKUXoP/vDcVzIJQcnTG/85zitPhtcRtddR2W1OxzaDmIeZK3
pUjx4wqV9QIDASAAMA0GCSqGSIb3DQEBAQUAA0EAPgGYi/1d0EraRaNQi7w6bPxl
b6PIF3AQdRuj94nYYudiHVXN8ihSO59HUXYrAyr0y1kCF1BUaGphxqC3oQg==
-----END CERTIFICATE-----`;
      fs.writeFileSync(certPath, certContent);
    }

    console.log('✓ Clés et certificats générés avec succès');
    console.log(`  - Clé privée: ${privateKeyPath}`);
    console.log(`  - Clé publique: ${publicKeyPath}`);
    console.log(`  - Certificat: ${certPath}`);

    module.exports = {
      privateKey,
      publicKey,
      cert: certContent
    };

  } catch (error) {
    console.error('Erreur lors de la génération des clés:', error);
    process.exit(1);
  }
}

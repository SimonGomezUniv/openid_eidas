let credentials = [];
let selectedCredentialIndex = -1;

// Charger les credentials depuis l'API
async function loadCredentials() {
  try {
    const response = await fetch('/api/credentials');
    const data = await response.json();
    credentials = data;
    populateCredentialSelect();
  } catch (error) {
    showNotification('Erreur lors du chargement des credentials', 'error');
    console.error(error);
  }
}

// Remplir le select avec les credentials
function populateCredentialSelect() {
  const select = document.getElementById('credentialSelect');
  
  // Garder l'option vide initiale
  select.innerHTML = '<option value="">Choisir un credential...</option>';
  
  // Ajouter les credentials
  credentials.forEach((cred, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = cred.type;
    select.appendChild(option);
  });
  
  // Sélectionner le premier credential par défaut
  if (credentials.length > 0) {
    select.value = "0";
    selectCredential(0);
  }
}

// Gestion du changement de select
document.addEventListener('DOMContentLoaded', function() {
  const select = document.getElementById('credentialSelect');
  if (select) {
    select.addEventListener('change', function(e) {
      if (e.target.value !== '') {
        selectCredential(parseInt(e.target.value));
      } else {
        clearCredentialDetails();
      }
    });
  }
  
  // Charger les credentials
  loadCredentials();
});

// Sélectionner un credential
function selectCredential(index) {
  selectedCredentialIndex = index;
  const cred = credentials[index];
  
  // Afficher les détails
  document.getElementById('noCredentialMessage').style.display = 'none';
  document.getElementById('credentialDetailsSection').style.display = 'block';
  
  // Remplir les détails
  document.getElementById('credentialDescription').value = cred.description;
  
  const claimsList = document.getElementById('credentialClaimsList');
  claimsList.innerHTML = cred.claims.map(claim => `<li>${claim.id}</li>`).join('');
  
  // Mettre à jour l'aperçu DCQL
  updateDHQLPreview();
}

// Effacer les détails du credential
function clearCredentialDetails() {
  selectedCredentialIndex = -1;
  document.getElementById('credentialDetailsSection').style.display = 'none';
  document.getElementById('noCredentialMessage').style.display = 'block';
  updateDHQLPreview();
}

// Mettre à jour l'aperçu DCQL
function updateDHQLPreview() {
  if (selectedCredentialIndex === -1) {
    document.getElementById('dhqlPreviewContent').textContent = JSON.stringify({
      credentials: [],
      credential_sets: []
    }, null, 2);
    return;
  }
  
  const cred = credentials[selectedCredentialIndex];
  
  const dcql = {
    credentials: [{
      id: cred.id,
      format: cred.format,
      meta: {
        vct_values: cred.vct_values
      },
      claims: cred.claims
    }],
    credential_sets: [{
      options: [[cred.id]],
      purpose: "verification"
    }]
  };
  
  document.getElementById('dhqlPreviewContent').textContent = JSON.stringify(dcql, null, 2);
}

// Exporter DCQL
function exportDHQL() {
  if (selectedCredentialIndex === -1) {
    showNotification('Veuillez sélectionner un credential', 'error');
    return;
  }
  
  const cred = credentials[selectedCredentialIndex];
  
  const dcql = {
    credentials: [{
      id: cred.id,
      format: cred.format,
      meta: {
        vct_values: cred.vct_values
      },
      claims: cred.claims
    }],
    credential_sets: [{
      options: [[cred.id]],
      purpose: "verification"
    }]
  };
  
  const blob = new Blob([JSON.stringify(dcql, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dcql-config.json';
  a.click();
  showNotification('Configuration DCQL exportée', 'success');
}

// Vérifier les credentials
async function verifyCredentials() {
  if (selectedCredentialIndex === -1) {
    showNotification('Veuillez sélectionner un credential', 'error');
    return;
  }
  
  const cred = credentials[selectedCredentialIndex];
  
  const dcql = {
    credentials: [{
      id: cred.id,
      format: cred.format,
      meta: {
        vct_values: cred.vct_values
      },
      claims: cred.claims
    }],
    credential_sets: [{
      options: [[cred.id]],
      purpose: "verification"
    }]
  };
  
  try {
    const response = await fetch('/api/presentation-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dcql)
    });
    
    if (!response.ok) {
      throw new Error('Erreur lors de la création de la demande');
    }
    
    const data = await response.json();
    await displayVerificationResult(data);
  } catch (error) {
    showNotification('Erreur: ' + error.message, 'error');
    console.error(error);
  }
}

// Afficher les notifications
function showNotification(message, type) {
  const container = document.getElementById('notifications');
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.textContent = message;
  container.appendChild(div);
  setTimeout(() => div.remove(), 5000);
}

// Afficher le résultat de la vérification
async function displayVerificationResult(data) {
  const { presentationRequestUrl } = data;
  
  // Remplir l'URL de la demande
  document.getElementById('presentationRequestUrl').value = presentationRequestUrl;
  
  // Construire le lien OpenID4VP
  const dnsName = window.location.hostname;
  const encodedRequestUri = encodeURIComponent(presentationRequestUrl);
  const openid4vpLink = `openid4vp://?client=${dnsName}&request_uri=${encodedRequestUri}`;
  
  // Créer le bouton avec le lien
  const linkContainer = document.getElementById('openid4vpLinkContainer');
  linkContainer.innerHTML = `
    <a href="${openid4vpLink}" class="btn-primary" style="display: inline-block; text-decoration: none;">
      📱 Ouvrir dans le Wallet
    </a>
  `;
  
  // Générer le QR code via l'API
  try {
    const qrResponse = await fetch('/api/qrcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: openid4vpLink })
    });
    
    if (!qrResponse.ok) {
      throw new Error('Erreur lors de la génération du QR code');
    }
    
    const qrData = await qrResponse.json();
    const qrContainer = document.getElementById('qrCodeContainer');
    qrContainer.innerHTML = `<img src="${qrData.qrCode}" alt="QR Code" style="border: 1px solid #ddd; border-radius: 8px;">`;
  } catch (error) {
    console.error('Erreur QR code:', error);
    showNotification('Erreur lors de la génération du QR code', 'error');
  }
  
  // Afficher la section des résultats
  document.getElementById('verificationResultSection').style.display = 'block';
  
  // Scroller vers la section
  document.getElementById('verificationResultSection').scrollIntoView({ behavior: 'smooth' });
  
  showNotification('Demande de vérification générée avec succès', 'success');
}

// Masquer le résultat de la vérification
function hideVerificationResult() {
  document.getElementById('verificationResultSection').style.display = 'none';
}

// Initialiser au chargement de la page
document.addEventListener('DOMContentLoaded', loadCredentials);

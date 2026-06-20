const crypto = require("node:crypto");

const WORDS = [
  "amber", "beacon", "cinder", "drift", "ember", "falcon", "grove", "harbor",
  "ion", "jungle", "kepler", "lotus", "matrix", "nova", "onyx", "pulse",
  "quartz", "raven", "solace", "tidal", "ultra", "vector", "willow", "zenith"
];

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

function randomBytes(bytes) {
  return crypto.randomBytes(bytes);
}

function b64(buffer) {
  return Buffer.from(buffer).toString("base64");
}

function unb64(value) {
  return Buffer.from(value, "base64");
}

function stablePairId(a, b) {
  return [a, b].sort().join("::");
}

function generatePairCode() {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  const digits = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return `${pick()}-${pick()}-${digits}-${pick()}`;
}

function deriveSessionKey({ code, initiatorId, responderId, initiatorNonce, responderNonce }) {
  const material = [
    code,
    stablePairId(initiatorId, responderId),
    Buffer.from(initiatorNonce).toString("hex"),
    Buffer.from(responderNonce).toString("hex")
  ].join("|");

  return crypto.scryptSync(material, "notely-p2p-harness", 32);
}

function makePairProof(key, transcript) {
  return crypto.createHmac("sha256", key).update(transcript).digest("hex");
}

function encryptAesGcm(key, plaintext, aad = "") {
  const iv = randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  if (aad) {
    cipher.setAAD(Buffer.from(aad, "utf8"));
  }

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: b64(iv),
    ciphertext: b64(ciphertext),
    tag: b64(tag)
  };
}

function decryptAesGcm(key, payload, aad = "") {
  const iv = unb64(payload.iv);
  const ciphertext = unb64(payload.ciphertext);
  const tag = unb64(payload.tag);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  if (aad) {
    decipher.setAAD(Buffer.from(aad, "utf8"));
  }

  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

module.exports = {
  randomHex,
  randomBytes,
  b64,
  unb64,
  stablePairId,
  generatePairCode,
  deriveSessionKey,
  makePairProof,
  encryptAesGcm,
  decryptAesGcm
};

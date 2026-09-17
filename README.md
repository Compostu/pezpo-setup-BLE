# PEZPO Setup Web — Web Bluetooth

Prototype Android sans application à installer.

## URL attendue

Exemple :

`https://VOTRE-DOMAINE/setup?hub=PZ-HUB-002&ble=PEZPO-HUB2&token=...`

Le QR devra pointer vers cette URL HTTPS.

## Android

Ouvrir avec Chrome. Cliquer `CONNECTER À PEZPO`.
Le navigateur ouvre son sélecteur Bluetooth, puis la page dialogue en BLE avec le Hub.

## iPhone

Safari iOS n'expose pas Web Bluetooth.
## Important

- HTTPS obligatoire pour Web Bluetooth.
- `requestDevice()` doit être déclenché par un geste utilisateur, donc par le bouton.
- Le `setup_token` est lu depuis l'URL mais n'est pas encore vérifié côté Hub.
- Avant production, ajouter l'authentification du token dans le protocole BLE.

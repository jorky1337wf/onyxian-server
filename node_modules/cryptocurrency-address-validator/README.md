# crypto-address-validator
Simple wallet address validator for validating Bitcoin and other altcoins addresses in **Node.js and browser**. 

Forked from [ognus/wallet-address-validator](https://github.com/ognus/wallet-address-validator).

**File size is ~201 KB (minifed)**.

## Installation

### NPM
```
npm install cryptocurrency-address-validator
```

### Browser
```html
<script src="crypto-address-validator.min.js"></script>
```

## API

##### validate (address [, currency = 'bitcoin'[, networkType = 'prod']])

###### Parameters
* address - Wallet address to validate.
* currency - Optional. Currency name or symbol, e.g. `'bitcoin'` (default), `'litecoin'` or `'LTC'`
* networkType - Optional. Use `'prod'` (default) to enforce standard address, `'testnet'` to enforce testnet address and `'both'` to enforce nothing. 

> Returns true if the address (string) is a valid wallet address for the crypto currency specified, see below for supported currencies.

##### getAddressType (address)

###### Parameters
* address - Wallet address.

> Returns address type (as 2 character hex string) if valid base58 address, otherwise null.

### Supported crypto currencies

* Auroracoin/AUR, `'auroracoin'` or `'AUR'`
* BeaverCoin/BVC, `'beavercoin'` or `'BVC'`
* Biocoin/BIO, `'biocoin'` or `'BIO'`
* Bitcoin/BTC, `'bitcoin'` or `'BTC'`
* BitcoinCash/BCH, `'bitcoincash'` or `'BCH'`
* BitcoinGold/BTG, `'bitcoingold'` or `'BTG'`
* BitcoinPrivate/BTCP, `'bitcoinprivate'` or `'BTCP'`
* BitcoinZ/BTCZ, `'bitcoinz'` or `'BTCZ'`
* Callisto/CLO, `'callisto'` or `'CLO'`
* Cardano/ADA, `'cardano'` or `'ADA'`
* Dash/DASH, `'dash'` or `'DASH'`
* Decred/DCR, `'decred'` or `'DCR'`
* Digibyte/DGB, `'digibyte'` or `'DGB'`
* Dogecoin/DOGE, `'dogecoin'` or `'DOGE'`
* Eos/EOS, `'eos'` or `'EOS'`
* Ethereum/ETH, `'ethereum'` or `'ETH'`
* EthereumClassic/ETH, `'ethereumclassic'` or `'ETC'`
* EthereumZero/ETZ, `'etherzero'` or `'ETZ'`
* Freicoin/FRC, `'freicoin'` or `'FRC'`
* Garlicoin/GRLC, `'garlicoin'` or `'GRLC'`
* Hush/HUSH, `'hush'` or `'HUSH'`
* Komodo/KMD, `'komodo'` or `'KMD'`
* Iota/IOTA, `'iota'` or `'IOTA'`
* Icon/ICON, `'icon'` or `'ICON'`
* Litecoin/LTC, `'litecoin'` or `'LTC'`
* Megacoin/MEC, `'megacoin'` or `'MEC'`
* Monero/XWR, `'monero'` or `'XMR'`
* Namecoin/NMC, `'namecoin'` or `'NMC'`
* Nano/NANO, `'nano'` or `'NANO'`
* Neo/NEO, `'neo'` or `'NEO'`
* NeoGas/GAS, `'neogas'` or `'GAS'`
* Nem/NEM, `'nem'` or `'nem'`
* Peercoin/PPCoin/PPC, `'peercoin'` or `'PPC'`
* Primecoin/XPM, `'primecoin'` or `'XPM'`
* Protoshares/PTS, `'protoshares'` or `'PTS'`
* Qash/QASH, `'qash'` or `'QASH'`
* Qtum/QTUM, `'qtum'` or `'QTUM'`
* Railblocks/XRB), `'railblocks'` or `'XRB'`
* RepublicProtocol/REN, `'republicprotocol'` or `'REN'`
* Ripple/XRP, `'ripple'` or `'XRP'`
* Snowgem/SNG, `'snowgem'` or `'SNG'`
* StellarLumens/XLM, `'stellarlumens'` or `'XLM'`
* Tronix/TRX, `'tronix'` or `'TRX'`
* Vertcoin/VTC, `'vertcoin'` or `'VTC'`
* VeChain, `'vechain'` or `'VeChain'` 
* Votecoin/VTC, `'votecoin'` or `'VOT'`
* Zcash/ZEC, `'zcash'` or `'ZEC'`
* Zclassic/ZCL, `'zclassic'` or `'ZCL'`
* ZenCash/ZEN, `'zencash'` or `'ZEN'`


### Usage example

#### Node
```javascript
var CAValidator = require('crypto-address-validator');

var valid = CAValidator.validate('1KFzzGtDdnq5hrwxXGjwVnKzRbvf8WVxck', 'BTC');
if(valid)
	console.log('This is a valid address');
else
	console.log('Address INVALID');

// This will log 'This is a valid address' to the console.
```

```javascript
var CAValidator = require('crypto-address-validator');

var valid = CAValidator.validate('1KFzzGtDdnq5hrwxXGjwVnKzRbvf8WVxck', 'litecoin', 'testnet');
if(valid)
      console.log('This is a valid address');
else
      console.log('Address INVALID');

// As this is a invalid litecoin address 'Address INVALID' will be logged to console.
```

#### Browser
```html
<script src="crypto-address-validator.min.js"></script>
```

```javascript
// CAValidator is exposed as a global (window.CAValidator)
var valid = CAValidator.validate('1KFzzGtDdnq5hrwxXGjwVnKzRbvf8WVxck', 'bitcoin');
if(valid)
    alert('This is a valid address');
else
    alert('Address INVALID');

// This should show a pop up with text 'This is a valid address'.
```

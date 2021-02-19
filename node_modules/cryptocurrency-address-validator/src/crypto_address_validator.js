var base58 = require('./crypto/base58');
var cryptoUtils = require('./crypto/utils');
var currencies = require('./currencies');
var IOTA = require('iota.lib.js');

var DEFAULT_CURRENCY_NAME = 'bitcoin';
var DEFAULT_NETWORK_TYPE = 'prod';

function getDecoded(address) {
    try {
        return base58.decode(address);
    } catch (e) {
        // if decoding fails, assume invalid address
        return null;
    }
}

function getChecksum(hashFunction, payload) {
    // Each currency may implement different hashing algorithm
    switch (hashFunction) {
        case 'blake224':
            return cryptoUtils.blake224Checksum(payload);
            break;
        case 'blake256':
            return cryptoUtils.blake256Checksum(payload);
            break;
        case 'blake384':
            return cryptoUtils.blake384Checksum(payload);
            break;
        case 'blake512':
            return cryptoUtils.blake512Checksum(payload);
            break;
        case 'sha256':
        default:
            return cryptoUtils.sha256Checksum(payload);
    }
}

function getAddressType(address, currency) {
    currency = currency || {};
    // should be 25 bytes per btc address spec and 26 decred
    var expectedLength = currency.expectedLength || 25;
    var hashFunction = currency.hashFunction || 'sha256';
    var decoded = getDecoded(address);

    if (decoded) {
        var length = decoded.length;

        if (length !== expectedLength) {
            return null;
        }

        var checksum = cryptoUtils.toHex(decoded.slice(length - 4, length)),
            body = cryptoUtils.toHex(decoded.slice(0, length - 4)),
            goodChecksum = getChecksum(hashFunction, body);

        return checksum === goodChecksum ? cryptoUtils.toHex(decoded.slice(0, expectedLength - 24)) : null;
    }

    return null;
}

function validate(address, currencyNameOrSymbol, networkType) {
    currencyNameOrSymbol = currencyNameOrSymbol || DEFAULT_CURRENCY_NAME;
    networkType = networkType || DEFAULT_NETWORK_TYPE;

    var currency = currencies.getByNameOrSymbol(currencyNameOrSymbol);

    if (currency.validator) {
        return currency.validator.isValidAddress(address);
    }

    if (currency.symbol == 'xmr' || currency.symbol == 'ada') {
        return getDecoded(address) ? true : false;
    }

    if (currency.symbol == 'nano' || currency.symbol == 'xrb') {
        return address.indexOf('xrb_') > -1 ? true : false;
    }

    if (currency.symbol == 'xlm') {
        return (address.indexOf('G') == 0 || address.indexOf('g') == 0) && address.length == 56;
    }

    if (currency.symbol == 'nem') {
        return (address.indexOf('N') == 0 || address.indexOf('T') == 0 || address.indexOf('n') == 0 || address.indexOf('t') == 0)  && address.length == 46;
    }

    if (currency.symbol == 'iota') {
        var iota = new IOTA({
            'provider': null
        });
          
        return iota.valid.isAddress(address);
    }

    var correctAddressTypes;
    var addressType = getAddressType(address, currency);
    if (addressType == null) {
        return false;
    }

    if (networkType === 'prod' || networkType === 'testnet'){
        correctAddressTypes = currency.addressTypes[networkType]
    } else {
        correctAddressTypes = currency.addressTypes.prod.concat(currency.addressTypes.testnet);
    }

    return correctAddressTypes.indexOf(addressType) >= 0;
}

module.exports = {
    getAddressType: getAddressType,
    checksum: getChecksum,
    validate: validate,
};

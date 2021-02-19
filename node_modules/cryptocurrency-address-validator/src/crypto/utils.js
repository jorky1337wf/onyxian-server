var jsSHA = require('jssha/src/sha256');
var Blake256 = require('./blake256');
var Blake224 = require('./blake224');
var Blake384 = require('./blake384');
var Blake512 = require('./blake512');
var keccak256 = require('./sha3')['keccak256'];

function numberToHex (number) {
    var hex = Math.round(number).toString(16);
    if(hex.length === 1) {
        hex = '0' + hex;
    }
    return hex;
}

module.exports = {
    toHex: function (arrayOfBytes) {
        var hex = '';
        for(var i = 0; i < arrayOfBytes.length; i++) {
            hex += numberToHex(arrayOfBytes[i]);
        }
        return hex;
    },
    sha256: function (hexString) {
        var sha = new jsSHA('SHA-256', 'HEX');
        sha.update(hexString);
        return sha.getHash('HEX');
    },
    sha256Checksum: function (payload) {
        return this.sha256(this.sha256(payload)).substr(0, 8);
    },
    blake224: function (hexString) {
        return new Blake224().update(hexString, 'hex').digest('hex');
    },
    blake224Checksum: function (payload) {
        return this.blake224(this.blake224(payload)).substr(0, 8);
    },
    blake256: function (hexString) {
        return new Blake256().update(hexString, 'hex').digest('hex');
    },
    blake256Checksum: function (payload) {
        return this.blake256(this.blake256(payload)).substr(0, 8);
    },
    blake384: function (hexString) {
        return new Blake384().update(hexString, 'hex').digest('hex');
    },
    blake384Checksum: function (payload) {
        return this.blake384(this.blake384(payload)).substr(0, 8);
    },
    blake512: function (hexString) {
        return new Blake512().update(hexString, 'hex').digest('hex');
    },
    blake512Checksum: function (payload) {
        return this.blake512(this.blake512(payload)).substr(0, 8);
    },
    keccak256: function (hexString) {
        return keccak256(hexString);
    }
};

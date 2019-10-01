const assert = require('assert');
const User = require('../../models/User.js');

describe('User', function() {
  describe('.generatePassword', function() {
    it('return a string of length 16', function() {
      const password = User.generatePassword();

      assert.equal(typeof password, 'string');
      assert.equal(password.length, 16);
    });

    it('returns specified length', function() {
      assert.equal(User.generatePassword(4).length, 4);
      assert.equal(User.generatePassword(11).length, 11);
      assert.equal(User.generatePassword(45).length, 45);
      assert.equal(User.generatePassword(64).length, 64);
    });

    it('returns different responses each time', function() {
      assert.notEqual(User.generatePassword(), User.generatePassword());
    });
  });
});

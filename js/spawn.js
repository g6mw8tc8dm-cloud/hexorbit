'use strict';

var Block = require('./Block').Block;

function addNewBlock(state, blocklane, color, iter, distFromHex, settled) {
  iter *= state.settings.speedModifier;
  state.blocks.push(new Block(state, blocklane, color, iter, distFromHex, settled));
}

module.exports = {
  addNewBlock: addNewBlock
};

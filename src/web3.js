import Web3 from 'web3';

const web3 = new Web3(process.env.REACT_APP_INFURA_MAINNET_URL);

// Check that we are connected to the Ethereum network
web3.eth.net.isListening()
  .then(() => console.log('Connected to Ethereum network'))
  .catch(error => console.error(`Unable to connect to Ethereum network: ${error}`));

export default web3;
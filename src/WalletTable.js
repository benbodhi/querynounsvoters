import React, { useState, useEffect, useMemo } from 'react';
import web3 from './web3';
import { abi, address } from './nounsTokenABI';
import firebase from './firebaseInit';
import './WalletTable.css';

const WalletTable = () => {
  const [data, setData] = useState([]);
  const [loadingTime, setLoadingTime] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [buttonDisabled, setButtonDisabled] = useState(false);
  const startTime = new Date();

  const fetchData = async () => {
    const database = firebase.database();
    const nounsRef = database.ref('nouns');
    const snapshot = await nounsRef.once('value');
    const snapshotData = snapshot.val();
    const contract = new web3.eth.Contract(abi, address);

    // Get total supply of tokens
    const totalSupply = await contract.methods.totalSupply().call();
    console.log('total supply:', totalSupply);

    // Get all token owner addresses
    const owners = [];
    console.log('Getting token holders and pushing to array');
    // for (let i = 0; i < totalSupply; i++) {
    for (let i = 0; i < Math.min(20, totalSupply); i++) { // testing only - replace with line above
      const owner = await contract.methods.ownerOf(i).call();
      // console.log('Owner of token', i, 'is', owner);
      if (!owners.includes(owner)) {
        // console.log('Pushing owner to array:', owner);
        owners.push(owner);
      }
    }

    console.log('Found', owners.length, 'unique token holders');
    // console.log('Token holders:', owners);

    // Check if each owner has a delegate and add delegate address to list if applicable
    const allAddresses = new Set();
    console.log('Checking token holders for delegation');
    for (let i = 0; i < owners.length; i++) {
      const owner = owners[i];
      // console.log('Checking owner', owner);
      const delegates = await contract.methods.delegates(owner).call();
      // console.log('Owner:', owner, 'Delegate:', delegates);
      if (delegates !== owner) {
        // console.log('Found delegate for owner', owner, 'delegate is', delegates);
        allAddresses.add(delegates);
      }
      allAddresses.add(owner);
    }

    console.log('Found', allAddresses.size, 'addresses with delegates included');
    // console.log('Addresses with votes:', allAddresses);

    // Get voting power for each address with a vote
    console.log('Getting voting power for owners or their delegates');
    const allData = await Promise.all(
      Array.from(allAddresses).map(async (address) => {
        let votingPower = 0;

        try {
          votingPower = await contract.methods.getCurrentVotes(address).call();
        } catch (error) {
          console.error(`Error getting voting power for address ${address}:`, error);
        }

        if (votingPower > 0) {
          return {
            walletAddress: address,
            votingPower,
          };
        } else {
          return null;
        }
      })
    );
    console.log('Fetched data:', allData.filter((item) => item !== null));

    const endTime = new Date();
    setLoadingTime(`Results generated in ${(endTime - startTime) / 1000} seconds`);
    console.log(data)

    // Return the fetched data instead of setting it directly
    return allData.filter((item) => item !== null);

  };

  const updateDataInDatabase = async () => {
    const database = firebase.database();
    const dataRef = database.ref('walletTableData');

    await dataRef.update({ refreshing: true });

    const newData = await fetchData();
    const currentTime = new Date();
    await dataRef.set({
      data: newData,
      lastUpdated: currentTime.toString(),
      refreshing: false,
    });
  };

  const loadDataFromDatabase = async () => {
    const database = firebase.database();
    const dataRef = database.ref('walletTableData');
    const snapshot = await dataRef.once('value');

    if (snapshot.exists()) {
      const { data, lastUpdated, refreshing } = snapshot.val();
      setData(data);
      setButtonDisabled(refreshing);
      setLoadingTime(`Results last updated at ${lastUpdated}`);
    } else {
      // Fetch and store the data in the database if it doesn't exist
      await updateDataInDatabase();
      await loadDataFromDatabase(); // Load the data again after storing it in the database
    }
  };

  const handleRefreshData = async () => {
    const shouldRefresh = window.confirm(
      'Refreshing the data may take a few minutes. Do you want to continue?'
    );

    if (shouldRefresh) {
      setLoadingTime('Refreshing data, please wait...');
      setButtonDisabled(true);
      await updateDataInDatabase();
      loadDataFromDatabase();
      setButtonDisabled(false);
    }
  };

  const handleExportCSV = async () => {
    const headers = {
      walletAddress: 'Wallet Address',
      votingPower: 'Voting Power',
    };

    const csv = sortedData.reduce((acc, row) => {
      const values = Object.keys(headers).map((key) => row[key]);
      return acc + values.join(',') + '\n';
    }, Object.values(headers).join(',') + '\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    const fileHandle = await window.showSaveFilePicker({
      suggestedName: 'data.csv',
      types: [{
        description: 'CSV file',
        accept: {
          'text/csv': ['.csv'],
        },
      }],
    });

    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  };

  // const refreshData = async () => {
  //   const newData = await fetchData();
  //   setData(newData);
  //   setLoadingTime(`Results generated in ${(new Date() - startTime) / 1000} seconds`);
  // };

  useEffect(() => {
    // refreshData(); // Fetch data when the component mounts

    // const intervalId = setInterval(() => {
    //   refreshData(); // Fetch data every hour (3600000 ms)
    // }, 3600000);

    loadDataFromDatabase(); // Load data from the database when the component mounts

    const intervalId = setInterval(() => {
      updateDataInDatabase(); // Update data in the database every hour (3600000 ms)
    }, 3600000);

    return () => clearInterval(intervalId); // Clean up the interval on component unmount
  }, []);

  // Sorting logic
  const sortedData = useMemo(() => {
    if (sortConfig.key !== null) {
      return [...data].sort((a, b) => {
        if (sortConfig.key === 'votingPower') {
          const numA = parseInt(a[sortConfig.key]);
          const numB = parseInt(b[sortConfig.key]);

          return sortConfig.direction === 'ascending' ? numA - numB : numB - numA;
        } else {
          if (a[sortConfig.key] < b[sortConfig.key]) {
            return sortConfig.direction === 'ascending' ? -1 : 1;
          }
          if (a[sortConfig.key] > b[sortConfig.key]) {
            return sortConfig.direction === 'ascending' ? 1 : -1;
          }
          return 0;
        }
      });
    }
    return data;
  }, [data, sortConfig]);

  const requestSort = (key) => {
    let direction = 'descending';
    if (sortConfig.key === key && sortConfig.direction === 'descending') {
      direction = 'ascending';
    }
    setSortConfig({ key, direction });
  };

  return (
    <>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th onClick={() => requestSort('walletAddress')}>
                Wallet Address {sortConfig.key === 'walletAddress' && sortConfig.direction === 'ascending' && '↑'}
                {sortConfig.key === 'walletAddress' && sortConfig.direction === 'descending' && '↓'}
              </th>
              <th onClick={() => requestSort('votingPower')}>
                Voting Power {sortConfig.key === 'votingPower' && sortConfig.direction === 'ascending' && '↑'}
                {sortConfig.key === 'votingPower' && sortConfig.direction === 'descending' && '↓'}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData
              .filter((item) => item.votingPower !== '0')
              .reduce((unique, item) => {
                return unique.find((u) => u.walletAddress === item.walletAddress) ? unique : [...unique, item];
              }, [])
              .map((item) => (
                <tr key={item.walletAddress}>
                  <td>{item.walletAddress}</td>
                  <td>{item.votingPower}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <p>{loadingTime}</p>
        <button className="refresh-button" onClick={handleRefreshData} disabled={buttonDisabled}>Refresh Data</button>
        <button className="export-button" onClick={handleExportCSV}>Export as CSV</button>
      </div>
    </>
  );
}
export default WalletTable;

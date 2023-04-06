import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import web3 from './web3';
import { abi, address } from './nounsTokenABI';
import firebase from './firebaseInit';
import './WalletTable.css';

const WalletTable = () => {
  const startTime = useRef(new Date());
  const progressStateRef = useRef({ current: { tokenHolders: 0, delegates: 0 } });
  const [data, setData] = useState([]);
  const [loadingTime, setLoadingTime] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [buttonDisabled, setButtonDisabled] = useState(false);
  const [progress, setProgress] = useState(null);
  const [delegatesProgress, setDelegatesProgress] = useState(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [showLogMessages, setShowLogMessages] = useState(false);
  const [logMessages, setLogMessages] = useState([]);

  useEffect(() => {
    const progressInterval = setInterval(() => {
    }, 3000);

    return () => {
      clearInterval(progressInterval);
    };
  }, []);

  const logMessage = (message, ...args) => {
    const formattedMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
    console.log(formattedMessage);
    setLogMessages((prevMessages) => [...prevMessages, formattedMessage]);
  };

  const fetchData = async () => {

    // Show log messages during data processing
    setShowLogMessages(true);

    logMessage('Fetching data from contract');
    const database = firebase.database();
    const progressRef = database.ref('walletTableData/progress');
    const nounsRef = database.ref('nouns');
    const snapshot = await nounsRef.once('value');
    const contract = new web3.eth.Contract(abi, address);

    // Get total supply of tokens
    const totalSupply = await contract.methods.totalSupply().call();
    logMessage('total supply:', totalSupply);

    // Get all token owner addresses
    const owners = [];

    // Set up an interval to log progress
    let progressInterval = setInterval(() => {
      progressStateRef.current.tokenHolders = owners.length;
    }, 3000);

    // Loop for token owners
    // for (let i = 0; i < totalSupply; i++) {
    for (let i = 0; i < Math.min(50, totalSupply); i++) { // testing only - replace with line above
      const owner = await contract.methods.ownerOf(i).call();
      // logMessage('Owner of token', i, 'is', owner);
      if (!owners.includes(owner)) {
        // logMessage('Pushing owner to array:', owner);
        owners.push(owner);
      }

      // Update progress in the database
      await progressRef.set(owners.length);

      // Update progress locally
      setProgress(owners.length);
    }

    // Clear the progress interval once the processing is complete
    clearInterval(progressInterval);

    // Clear progress in the database when finished
    await progressRef.set(null);

    // Clear progress when finished
    setProgress(null);

    // Clear progress message when finished
    setProgressMessage('');

    logMessage('Found', owners.length, 'unique token holders');

    // Check if each owner has a delegate and add delegate address to list if applicable
    logMessage('Checking token holders for delegation');

    const allAddresses = new Set();

    // Set up an interval to log delegates progress
    let delegatesProgressInterval = setInterval(() => {
      setDelegatesProgress(allAddresses.size);
    }, 3000);

    for (let i = 0; i < owners.length; i++) {
      const owner = owners[i];
      // logMessage('Checking owner', owner);
      const delegates = await contract.methods.delegates(owner).call();
      // logMessage('Owner:', owner, 'Delegate:', delegates);
      if (delegates !== owner) {
        // logMessage('Found delegate for owner', owner, 'delegate is', delegates);
        allAddresses.add(delegates);
      }
      allAddresses.add(owner);

      // Update progress locally
      setDelegatesProgress(allAddresses.size);
    }

    logMessage('Found', allAddresses.size, 'addresses with delegates included');
    // logMessage('Addresses with votes:', allAddresses);

    // Reset progress values
    progressStateRef.current.tokenHolders = 0;
    progressStateRef.current.delegates = 0;

    // Clear the delegates progress interval once the processing is complete
    clearInterval(delegatesProgressInterval);

    // Clear progress when finished
    setDelegatesProgress(null);

    // Clear progress message when finished
    setProgressMessage('');

    // Get voting power for each address with a vote
    logMessage('Getting voting power for owners or their delegates');
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

    const filteredData = allData.filter((item) => item !== null);
    // logMessage('Found', filteredData.length, 'addresses with voting power:', filteredData);
    logMessage('Found', filteredData.length, 'addresses with voting power');

    const endTime = new Date();
    setLoadingTime(`Results generated in ${(endTime - startTime) / 1000} seconds`);

    // Return the fetched data instead of setting it directly
    return allData.filter((item) => item !== null);

  };

  const updateDataInDatabase = useCallback(async () => {
    logMessage('Updating data in the database');
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
  }, []);

  const loadDataFromDatabase = useCallback(async () => {
    logMessage('Loading data from the database');
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
    logMessage('Loaded data from the database');

    const timeoutId = setTimeout(() => {
      setLogMessages([]);
    }, 10000);

    return () => clearTimeout(timeoutId);
  }, []);

  const handleRefreshData = async () => {
    const shouldRefresh = window.confirm(
      'Refreshing the data may take a few minutes. Do you want to continue?'
    );

    if (shouldRefresh) {
      setLoadingTime('Refreshing data, please wait...');
      setButtonDisabled(true);
      await updateDataInDatabase();
      await loadDataFromDatabase();
      setButtonDisabled(false);
    }
  };

  const handleExportCSV = async () => {
    logMessage('Exporting data as CSV');
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
      suggestedName: 'Nouns DAO Voter Table.csv',
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

    const timeoutId = setTimeout(() => {
      setLogMessages([]);
    }, 3000);

    return () => clearTimeout(timeoutId);
  };

  useEffect(() => {
    loadDataFromDatabase(); // Load data from the database when the component mounts

    logMessage('Setting up interval to update data every hour');
    const intervalId = setInterval(() => {
      updateDataInDatabase(); // Update data in the database every hour (3600000 ms)
    }, 3600000);

    return () => {
      logMessage('Clearing interval');
      clearInterval(intervalId); // Clean up the interval on component unmount
    };
  }, [loadDataFromDatabase, updateDataInDatabase]);

  // Load the progress from the database and update the local state when it changes
  useEffect(() => {
    const database = firebase.database();
    const progressRef = database.ref('walletTableData/progress');

    // Attach a listener to the progress in the database
    const onProgressChange = progressRef.on('value', (snapshot) => {
      const progressValue = snapshot.val();
      setProgress(progressValue);
    });

    // Clean up the listener when the component is unmounted
    return () => {
      progressRef.off('value', onProgressChange);
    };
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
  }, [data, sortConfig]) || [];

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
        <button className="refresh-button" onClick={handleRefreshData} disabled={buttonDisabled}>Refresh Data</button>
        <button className="export-button" onClick={handleExportCSV}>Export as CSV</button>
        <div className="log-message">
          {logMessages.map((message, index) => (
            <div key={index}>
              {message}
            </div>
          ))}
        </div>
        <p>
          {progress !== null && (
            <span className="progress">Processed {progress} token holders so far</span>
          )}
        </p>
        <p>
          {delegatesProgress !== null && (
            <span className="delegatesProgress">Processed {delegatesProgress} delegates so far</span>
          )}
        </p>
        <p className="progressMessage">{progressMessage}</p>
        <p className="loadingTime">{loadingTime}</p>
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
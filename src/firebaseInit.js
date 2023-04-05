import firebase from 'firebase/compat/app';
import 'firebase/compat/database';
import firebaseConfig from './firebaseConfig';

if (firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
  firebase.database().useEmulator("localhost", 9000);
}

export default firebase;

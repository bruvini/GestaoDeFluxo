import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: 'AIzaSyA0vqM9mdXDo7F4Kq3daBWhxoHMaiY8-nE',
    authDomain: 'pmj-hmsj.firebaseapp.com',
    projectId: 'pmj-hmsj',
    storageBucket: 'pmj-hmsj.firebasestorage.app',
    messagingSenderId: '226296836721',
    appId: '1:226296836721:web:bc71794ecadbcc43e6e1d0',
    measurementId: 'G-WS3LJC8RP4'
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

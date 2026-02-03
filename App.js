import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Alert, Linking, Animated, Dimensions, ActivityIndicator } from 'react-native';
import { Provider as PaperProvider, DefaultTheme, Appbar, FAB, Card, Title, Paragraph, Portal, Dialog, Button, Text, List, Surface, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Contacts from 'expo-contacts';
import { Audio } from 'expo-av';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import 'react-native-gesture-handler';
import TrustedContactsScreen from './screens/TrustedContactsScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SMS from 'expo-sms';
import SettingsScreen from './screens/SettingsScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import ViewProfileScreen from './screens/ViewProfileScreen';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import FeatureCard from './components/FeatureCard';
import { resourceCategories } from './utils/resources';
import ResourcesScreen from './screens/ResourcesScreen';
import MapScreen from './screens/MapScreen';
import { useLocation } from './hooks/useLocation';
import { useAudio } from './hooks/useAudio';
import { useGestureDetection } from './hooks/useGestureDetection';
import { shareLocation, openSafeRoutes, sendLocationToContacts } from './utils/locationUtils';
import SOSButton from './components/SOSButton';
import ScreamDetection from './components/ScreamDetection';

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#FF4081',
    accent: '#f1c40f',
    background: '#f5f5f5',
    surface: '#ffffff',
    text: '#333333',
    error: '#f44336',
    success: '#4CAF50',
  },
  roundness: 12,
};

const HomeScreen = ({ navigation }) => {
  // Animation refs
  const cardScale = useRef(new Animated.Value(1)).current;
  const sosScale = useRef(new Animated.Value(1)).current;
  const sosRotation = useRef(new Animated.Value(0)).current;
  const cardAnimations = useRef(Array(6).fill(0).map(() => new Animated.Value(0))).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [isPanicMode, setIsPanicMode] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationPermission, setLocationPermission] = useState(null);
  const [sound, setSound] = useState();
  const [isPlaying, setIsPlaying] = useState(false);
  const [trustedContacts, setTrustedContacts] = useState([]);
  const [visible, setVisible] = useState(false);
  const [dialogContent, setDialogContent] = useState({ title: '', content: '' });
  const { isGestureDetectionEnabled, setIsGestureDetectionEnabled, shakeCount } = useGestureDetection(() => {
    if (isGestureDetectionEnabled && !isPanicMode) {
      handleSOSPress();
    }
  });

  // Add loading state
  const [isLocationLoading, setIsLocationLoading] = useState(false);

  // Custom hooks
  const { getCurrentLocation } = useLocation();
  const { playAlarm, stopAlarm } = useAudio();

  useEffect(() => {
    // Initialize Audio module
    const setupAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        console.log('Audio module initialized successfully');
      } catch (error) {
        console.error('Error initializing audio:', error);
      }
    };

    setupAudio();

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for this app.');
        return;
      }

      let { status: contactStatus } = await Contacts.requestPermissionsAsync();
      if (contactStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Contacts permission is required for this app.');
      }
    })();
  }, []);

  useEffect(() => {
    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();

    // Staggered card animations
    Animated.stagger(100, cardAnimations.map(anim =>
      Animated.spring(anim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      })
    )).start();
  }, []);

  const showDialog = (title, content) => {
    setDialogContent({ title, content });
    setVisible(true);
  };

  const hideDialog = () => setVisible(false);

  const handleSOSPress = async () => {
    console.log('SOS button pressed, current panic mode:', isPanicMode);
    animateSOSPress();
    if (!isPanicMode) {
      try {
        console.log('Activating SOS mode');
        // Set panic mode first
        setIsPanicMode(true);
        
        // Start playing alarm and send location in parallel
        await Promise.all([
          playAlarm(),
          sendLocationToContacts()
        ]);
        console.log('SOS mode activated successfully');
      } catch (error) {
        console.error('Error in panic mode:', error);
        Alert.alert('Error', 'Failed to activate emergency mode. Please try again.');
        setIsPanicMode(false);
        await stopAlarm();
      }
    } else {
      console.log('Deactivating SOS mode');
      // If SOS is already active, just cancel it without sending location
      setIsPanicMode(false);
      await stopAlarm();
      console.log('SOS mode deactivated successfully');
    }
  };

  const handleAlarmPress = async () => {
    try {
      console.log('Alarm button pressed, current state:', isPlaying);
      if (isPlaying) {
        console.log('Stopping alarm...');
        await stopAlarm();
        setIsPlaying(false);
        setIsPanicMode(false);
      } else {
        console.log('Starting alarm...');
        await playAlarm();
        setIsPlaying(true);
        setIsPanicMode(true);
      }
    } catch (error) {
      console.error('Error handling alarm:', error);
      Alert.alert('Error', 'Failed to control alarm. Please try again.');
      // Reset states in case of error
      setIsPlaying(false);
      setIsPanicMode(false);
    }
  };

  const renderFeatureCard = (title, description, icon, onPress, index) => {
    const translateY = cardAnimations[index].interpolate({
      inputRange: [0, 1],
      outputRange: [50, 0],
    });

    const handlePress = () => {
      animateCardPress(index);
      if (title === 'Alarm') {
        handleAlarmPress();
      } else {
        onPress();
      }
    };

    return (
      <FeatureCard
        key={title}
        title={title}
        description={description}
        icon={icon}
        onPress={handlePress}
        isLoading={title === 'Live Location' && isLocationLoading}
        isAlarm={title === 'Alarm'}
        isPlaying={isPlaying}
        translateY={translateY}
        scale={cardScale}
      />
    );
  };

  const animateCardPress = (index) => {
    Animated.sequence([
      Animated.timing(cardScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(cardScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateSOSPress = () => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(sosScale, {
          toValue: 0.9,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(sosScale, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(sosRotation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const makeEmergencyCall = () => {
    Alert.alert(
      'Emergency Call',
      'Do you want to call emergency services?',
      [
        {
          text: 'Call Police (100)',
          onPress: () => Linking.openURL('tel:100'),
        },
        {
          text: 'Call Ambulance (102)',
          onPress: () => Linking.openURL('tel:102'),
        },
        {
          text: 'Call Women Helpline (1091)',
          onPress: () => Linking.openURL('tel:1091'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  };

  const openSafeRoutes = async () => {
    try {
      // Get last known location first for immediate response
      let lastLocation = await Location.getLastKnownPositionAsync({});
      
      // Start getting current location in background
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced, // Lower accuracy for faster response
        maximumAge: 10000, // Accept locations up to 10 seconds old
      }).then(currentLocation => {
        // Update with more accurate location when available
        const url = `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${currentLocation.coords.latitude},${currentLocation.coords.longitude}`;
        Linking.openURL(url);
      }).catch(error => {
        // If current location fails, use last known location
        if (lastLocation) {
          const url = `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${lastLocation.coords.latitude},${lastLocation.coords.longitude}`;
          Linking.openURL(url);
        } else {
          throw error;
        }
      });

      // If we have last known location, open map immediately
      if (lastLocation) {
        const url = `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${lastLocation.coords.latitude},${lastLocation.coords.longitude}`;
        await Linking.openURL(url);
      }
      
    } catch (error) {
      console.error('Error opening safe routes:', error);
      Alert.alert('Error', 'Could not access safe routes. Please check your location settings.');
    }
  };

  const openMap = () => {
    navigation.navigate('Map');
  };

  const [userProfile, setUserProfile] = useState({
    name: '',
    age: '',
    bloodGroup: '',
    emergencyContact: '',
    medicalConditions: '',
  });
  
  const loadUserProfile = async () => {
    try {
      const savedProfile = await AsyncStorage.getItem('userProfile');
      if (savedProfile) {
        setUserProfile(JSON.parse(savedProfile));
      }
    } catch (error) {
      Alert.alert('Error', 'Could not load profile');
    }
  };
  
  const openSettings = () => {
    console.log('Opening Settings Screen');
    navigation.navigate('Settings');
  };
  
  const showProfileDialog = () => {
    showDialog('Profile', 
      `Name: ${userProfile.name || 'Not set'}
    Age: ${userProfile.age || 'Not set'}
    Blood Group: ${userProfile.bloodGroup || 'Not set'}
    Emergency Contact: ${userProfile.emergencyContact || 'Not set'}
    Medical Conditions: ${userProfile.medicalConditions || 'None'}`
    );
  };
  
  const showEmergencyNumbersDialog = () => {
    showDialog('Emergency Numbers',
      'Police: 100\nAmbulance: 102\nWomen Helpline: 1091\nChild Helpline: 1098\nFire: 101'
    );
  };
  
  const showSafetyTipsDialog = () => {
    showDialog('Safety Tips',
      '1. Share your location with trusted contacts\n' +
      '2. Keep emergency numbers handy\n' +
      '3. Stay aware of your surroundings\n' +
      '4. Use well-lit and populated routes\n' +
      '5. Keep your phone charged\n' +
      '6. Learn basic self-defense techniques'
    );
  };
  
  const showAboutDialog = () => {
    showDialog('About SOSAngel',
      'SOSAngel is a personal safety app designed to provide quick access to emergency services and safety features.\n\n' +
      'Version: 1.0.0\n' +
      'Emergency Contact: support@sosangel.com'
    );
  };
  
  useEffect(() => {
    loadUserProfile();
  }, []);

  const startFakeCall = () => {
    setIsFakeCalling(true);
    const timer = setTimeout(() => {
      setIsFakeCalling(false);
      clearTimeout(timer);
    }, 30000);
    setCallTimer(timer);
  };

  const openResources = () => {
    navigation.navigate('Resources');
  };

  const [isFakeCalling, setIsFakeCalling] = useState(false);
  const [callTimer, setCallTimer] = useState(null);

  const manageTrustedContacts = () => {
    navigation.navigate('TrustedContacts');
  };

  // Add location watch subscription
  useEffect(() => {
    let locationSubscription;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setLocationPermission(status);
        
        if (status === 'granted') {
          // Get initial location
          const initialLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setLocation(initialLocation);

          // Start watching location
          locationSubscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 5000, // Update every 5 seconds
              distanceInterval: 10, // Update every 10 meters
            },
            (newLocation) => {
              setLocation(newLocation);
            }
          );
        }
      } catch (error) {
        console.error('Error setting up location:', error);
      }
    })();

    // Cleanup subscription
    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content 
          title="SOSAngel" 
          titleStyle={styles.headerTitle}
          subtitle="Your Safety Companion"
        />
        <Appbar.Action 
          icon="account-circle" 
          color="white" 
          onPress={() => navigation.navigate('ViewProfile')} 
        />
      </Appbar.Header>
    
      <View style={styles.content}>
        <SOSButton
          isPanicMode={isPanicMode}
          onPress={handleSOSPress}
          sosScale={sosScale}
          sosRotation={sosRotation}
        />
    
        <View style={styles.gridContainer}>
          {renderFeatureCard('Live Location', 'Share your location', 'map-marker', () => shareLocation(location), 0)}
          {renderFeatureCard('Trusted Contacts', 'Emergency contacts', 'account-group', () => navigation.navigate('TrustedContacts'), 1)}
          {renderFeatureCard('Emergency Call', 'Quick access', 'phone', makeEmergencyCall, 2)}
          {renderFeatureCard('Safe Routes', 'Navigate safely', 'routes', () => openSafeRoutes(location), 3)}
          {renderFeatureCard('Alarm', isPlaying ? 'Stop alarm' : 'Trigger alarm', 'bell-ring', handleAlarmPress, 4)}
          {renderFeatureCard('Gesture Detection', isGestureDetectionEnabled ? `Active - Shake count: ${shakeCount}` : 'Inactive', 'gesture', () => setIsGestureDetectionEnabled(!isGestureDetectionEnabled), 5)}
        </View>
      </View>
    
      <Appbar style={styles.bottomNav}>
        <Appbar.Action icon="home" color={theme.colors.primary} />
        <Appbar.Action icon="map" onPress={openMap} />
        <Appbar.Action icon="book" onPress={openResources} />
        <Appbar.Action 
          icon="cog" 
          color={theme.colors.primary}
          onPress={() => navigation.navigate('Settings')}
        />
      </Appbar>
    
      <Portal>
        <Dialog visible={visible} onDismiss={hideDialog} style={styles.dialog}>
          <Dialog.Title style={styles.dialogTitle}>{dialogContent.title}</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogContent}>{dialogContent.content}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={hideDialog} mode="contained" style={styles.dialogButton}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#FF4081',
    elevation: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
    marginTop: 80,
    paddingHorizontal: 8,
  },
  cardSurface: {
    width: '45%',
    marginVertical: 10,
    elevation: 4,
    borderRadius: 12,
    aspectRatio: 1,
    backgroundColor: 'white',
    overflow: 'visible',
  },
  cardInner: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
    textAlign: 'center',
    opacity: 1, // Added opacity
  },
  cardDescription: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
    opacity: 1, // Added opacity
  },
  sos: {
    position: 'absolute',
    margin: 16,
    left: 16,
    right: 16,
    top: -28,
    backgroundColor: '#FF4081',
    borderRadius: 30,
    zIndex: 1,
  },
  sosActive: {
    backgroundColor: '#f44336',
  },
  bottomNav: {
    backgroundColor: 'white',
    elevation: 8,
  },
  sosContainer: {
    position: 'relative',
  },
  cardElevation: {
    elevation: 4,
  },
  dialog: {
    backgroundColor: 'white',
    borderRadius: 12,
  },
  dialogTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF4081',
  },
  dialogContent: {
    fontSize: 16,
    color: '#333',
  },
  dialogButton: {
    backgroundColor: '#FF4081',
    borderRadius: 8,
  },
  alarmCard: {
    borderWidth: 2,
    borderColor: '#FF4081',
  },
  alarmStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  alarmIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ccc',
    marginRight: 4,
  },
  alarmActive: {
    backgroundColor: '#f44336',
  },
  alarmStatusText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
});

const Stack = createStackNavigator();

const App = () => {
  return (
    <PaperProvider theme={theme}>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen 
            name="Home" 
            component={HomeScreen} 
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Map" 
            component={MapScreen}
            options={{
              title: 'Map',
              headerStyle: {
                backgroundColor: '#FF4081',
              },
              headerTintColor: '#fff',
            }}
          />
          <Stack.Screen 
            name="TrustedContacts" 
            component={TrustedContactsScreen}
            options={{
              title: 'Trusted Contacts',
              headerStyle: {
                backgroundColor: '#FF4081',
              },
              headerTintColor: '#fff',
            }}
          />
          <Stack.Screen 
            name="Settings" 
            component={SettingsScreen}
            options={{
              title: 'Settings',
              headerStyle: {
                backgroundColor: '#FF4081',
              },
              headerTintColor: '#fff',
            }}
          />
          <Stack.Screen 
            name="EditProfile" 
            component={EditProfileScreen}
            options={{
              title: 'Edit Profile',
              headerStyle: {
                backgroundColor: '#FF4081',
              },
              headerTintColor: '#fff',
            }}
          />
          <Stack.Screen 
            name="ViewProfile" 
            component={ViewProfileScreen}
            options={{
              title: 'Profile',
              headerStyle: {
                backgroundColor: '#FF4081',
              },
              headerTintColor: '#fff',
            }}
          />
          <Stack.Screen 
            name="Resources" 
            component={ResourcesScreen}
            options={{
              title: 'Safety Resources',
              headerStyle: {
                backgroundColor: '#FF4081',
              },
              headerTintColor: '#fff',
            }}
          />
          <Stack.Screen 
            name="ScreamDetection" 
            component={ScreamDetection}
            options={{
              title: 'Scream Detection',
              headerStyle: {
                backgroundColor: '#FF4081',
              },
              headerTintColor: '#fff',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
};

export default App;

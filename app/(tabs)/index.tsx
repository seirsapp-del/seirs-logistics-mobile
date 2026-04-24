import { View, Text, Pressable, StyleSheet } from "react-native";

export default function HomeScreen() {
 return (
    <View style={styles.container}>
      <Text style={styles.title}>Seirs Logistics 🚚</Text>

      <Pressable style={styles.button}>
        <Text style={styles.buttonText}>Request Delivery</Text>
      </Pressable>

      <Pressable style={styles.button}>
        <Text style={styles.buttonText}>Track Package</Text>
      </Pressable>

      <Pressable style={styles.button}>
        <Text style={styles.buttonText}>Become a Driver</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    gap: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 30,
  },
  button: {
    backgroundColor: "#1D3D47",
    padding: 15,
    width: 250,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
  },
});
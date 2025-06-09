import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Home",
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="camera"
        options={{
          title: "Camera",
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="panorama-camera"
        options={{
          title: "Panorama Camera",
          headerShown: true,
        }}
      />
    </Stack>
  );
}
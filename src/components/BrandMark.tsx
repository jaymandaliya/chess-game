import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Circle, Stop } from 'react-native-svg';
import { colors } from '../theme';

// App logo: knight on a green tile with a soft glow behind it
export default function BrandMark({ size = 72 }: { size?: number }) {
  const glow = size * 2.2;
  return (
    <View
      style={{
        width: glow,
        height: glow,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={glow} height={glow} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="brandGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.primary} stopOpacity="0.35" />
            <Stop offset="1" stopColor={colors.primary} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle
          cx={glow / 2}
          cy={glow / 2}
          r={glow / 2}
          fill="url(#brandGlow)"
        />
      </Svg>
      <View
        style={[
          styles.tile,
          { width: size, height: size, borderRadius: size * 0.3 },
        ]}
      >
        <Text
          style={{
            fontSize: size * 0.62,
            color: colors.onPrimary,
            lineHeight: size * 0.8,
          }}
        >
          {'♞︎'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
});

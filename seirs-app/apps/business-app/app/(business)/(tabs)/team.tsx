import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
  TextInput, Alert, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { businessApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';

const TEAM_ROLES = [
  { key: 'manager',    label: 'Manager',    desc: 'Can create deliveries and view all orders' },
  { key: 'dispatcher', label: 'Dispatcher', desc: 'Can create and track deliveries only' },
  { key: 'viewer',     label: 'Viewer',     desc: 'Read-only access to dashboard' },
];

const ROLE_COLOR: Record<string, string> = {
  owner:      '#0F2B4C',
  manager:    '#3A7BD5',
  dispatcher: '#7C3AED',
  viewer:     '#6B7280',
};

interface TeamMember {
  id:       string;
  name:     string;
  email:    string;
  teamRole: string;
  status:   'active' | 'pending';
}

export default function TeamScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [members,  setMembers]  = useState<TeamMember[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showAdd,  setShowAdd]  = useState(false);
  const [invite,   setInvite]   = useState({ name: '', email: '', teamRole: 'dispatcher' });
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = () => {
    businessApi.team()
      .then((data: any) => setMembers(Array.isArray(data) ? data : data?.members ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleInvite = async () => {
    if (!invite.name.trim() || !invite.email.trim()) return;
    setInviting(true);
    try {
      await businessApi.inviteTeamMember(invite);
      setShowAdd(false);
      setInvite({ name: '', email: '', teamRole: 'dispatcher' });
      load();
      Alert.alert('Invitation Sent', `An email has been sent to ${invite.email}`);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to send invitation.');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = (member: TeamMember) => {
    Alert.alert(
      'Remove Team Member',
      `Remove ${member.name} from your team?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setRemoving(member.id);
            try {
              await businessApi.removeTeamMember(member.id);
              load();
            } finally { setRemoving(null); }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Text style={[styles.heading, { color: colors.text }]}>Team Members</Text>
        <Pressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setShowAdd(true)}>
          <Icon name="UserPlus" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Invite</Text>
        </Pressable>
      </View>

      <View style={[styles.legendCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.legendTitle, { color: colors.textSecond }]}>Account Roles</Text>
        <View style={styles.legendGrid}>
          {[{ key: 'owner', label: 'Owner', desc: 'Full access to all features' }, ...TEAM_ROLES].map((r) => (
            <View key={r.key} style={styles.legendRow}>
              <View style={[styles.roleDot, { backgroundColor: ROLE_COLOR[r.key] ?? colors.textThird }]} />
              <View>
                <Text style={[styles.roleLabel, { color: colors.text }]}>{r.label}</Text>
                <Text style={[styles.roleDesc, { color: colors.textSecond }]}>{r.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          {members.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="Users" size={40} color={colors.textThird} />
              <Text style={[styles.emptyText, { color: colors.text }]}>No team members yet</Text>
              <Text style={[styles.emptySub, { color: colors.textThird }]}>Invite Managers and Dispatchers to collaborate</Text>
            </View>
          ) : (
            members.map((m) => (
              <View
                key={m.id}
                style={[styles.memberCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                  <Text style={styles.avatarText}>{m.name[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.memberTop}>
                    <Text style={[styles.memberName, { color: colors.text }]}>{m.name}</Text>
                    <View style={[styles.roleBadge, { backgroundColor: (ROLE_COLOR[m.teamRole] ?? colors.textThird) + '18' }]}>
                      <Text style={[styles.roleBadgeText, { color: ROLE_COLOR[m.teamRole] ?? colors.textThird }]}>
                        {m.teamRole}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.memberEmail, { color: colors.textSecond }]}>{m.email}</Text>
                  {m.status === 'pending' && (
                    <Text style={styles.pendingText}>Invitation pending</Text>
                  )}
                </View>
                {m.teamRole !== 'owner' && (
                  <Pressable onPress={() => handleRemove(m)} disabled={removing === m.id}>
                    {removing === m.id
                      ? <ActivityIndicator size="small" color="#DC2626" />
                      : <Icon name="UserMinus" size={18} color="#DC2626" />}
                  </Pressable>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={showAdd} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowAdd(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24, backgroundColor: colors.surface }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Invite Team Member</Text>

          <Text style={[styles.label, { color: colors.textSecond }]}>Full Name</Text>
          <TextInput
            style={[styles.input, {
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.text,
            }]}
            value={invite.name}
            onChangeText={(v) => setInvite((i) => ({ ...i, name: v }))}
            placeholder="Aisha Adebayo"
            placeholderTextColor={colors.textThird}
          />

          <Text style={[styles.label, { color: colors.textSecond }]}>Email Address</Text>
          <TextInput
            style={[styles.input, {
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.text,
            }]}
            value={invite.email}
            onChangeText={(v) => setInvite((i) => ({ ...i, email: v }))}
            placeholder="ada@company.ng"
            placeholderTextColor={colors.textThird}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={[styles.label, { color: colors.textSecond }]}>Role</Text>
          <View style={styles.roleGrid}>
            {TEAM_ROLES.map((r) => {
              const active = invite.teamRole === r.key;
              return (
                <Pressable
                  key={r.key}
                  style={[
                    styles.roleCard,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    active && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                  ]}
                  onPress={() => setInvite((i) => ({ ...i, teamRole: r.key }))}
                >
                  <Text style={[
                    styles.roleCardLabel,
                    { color: colors.textSecond },
                    active && { color: colors.text },
                  ]}>{r.label}</Text>
                  <Text style={[
                    styles.roleCardDesc,
                    { color: colors.textThird },
                    active && { color: colors.textSecond },
                  ]}>{r.desc}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[
              styles.inviteBtn,
              { backgroundColor: colors.primary },
              (!invite.name || !invite.email || inviting) && styles.inviteBtnDisabled,
            ]}
            onPress={handleInvite}
            disabled={!invite.name || !invite.email || inviting}
          >
            {inviting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.inviteBtnText}>Send Invitation</Text>}
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header:      {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  heading:     { fontSize: 20, fontWeight: '800' },
  addBtn:      {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnText:  { color: '#fff', fontWeight: '700', fontSize: 13 },
  legendCard:  { margin: 16, borderRadius: 14, padding: 16, borderWidth: 1 },
  legendTitle: { fontSize: 12, fontWeight: '700', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  legendGrid:  { gap: 10 },
  legendRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  roleDot:     { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  roleLabel:   { fontSize: 13, fontWeight: '700' },
  roleDesc:    { fontSize: 11, marginTop: 1 },
  empty:       { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText:   { fontSize: 15, fontWeight: '600' },
  emptySub:    { fontSize: 13, textAlign: 'center' },
  memberCard:  {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1,
  },
  avatar:      { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 16, fontWeight: '800', color: '#fff' },
  memberTop:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  memberName:  { fontSize: 14, fontWeight: '700' },
  roleBadge:   { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  roleBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  memberEmail: { fontSize: 12 },
  pendingText: { fontSize: 11, color: '#D97706', marginTop: 2, fontWeight: '600' },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingTop: 12 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle:  { fontSize: 18, fontWeight: '800', marginBottom: 20 },
  label:       { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input:       {
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, fontSize: 15, marginBottom: 14,
  },
  roleGrid:    { gap: 8, marginBottom: 20 },
  roleCard:    { padding: 14, borderRadius: 12, borderWidth: 1.5 },
  roleCardLabel: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  roleCardDesc:  { fontSize: 12 },
  inviteBtn:    { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  inviteBtnDisabled: { opacity: 0.4 },
  inviteBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

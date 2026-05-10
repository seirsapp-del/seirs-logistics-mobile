import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
  TextInput, Alert, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { businessApi } from '@/services/api';

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
            } finally {
              setRemoving(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F0' }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.heading}>Team Members</Text>
        <Pressable style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Icon name="UserPlus" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Invite</Text>
        </Pressable>
      </View>

      {/* Roles legend */}
      <View style={styles.legendCard}>
        <Text style={styles.legendTitle}>Account Roles</Text>
        <View style={styles.legendGrid}>
          {[{ key: 'owner', label: 'Owner', desc: 'Full access to all features' }, ...TEAM_ROLES].map((r) => (
            <View key={r.key} style={styles.legendRow}>
              <View style={[styles.roleDot, { backgroundColor: ROLE_COLOR[r.key] ?? '#9CA3AF' }]} />
              <View>
                <Text style={styles.roleLabel}>{r.label}</Text>
                <Text style={styles.roleDesc}>{r.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#3A7BD5" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          {members.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="Users" size={40} color="#D1D5DB" />
              <Text style={styles.emptyText}>No team members yet</Text>
              <Text style={styles.emptySub}>Invite Managers and Dispatchers to collaborate</Text>
            </View>
          ) : (
            members.map((m) => (
              <View key={m.id} style={styles.memberCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{m.name[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.memberTop}>
                    <Text style={styles.memberName}>{m.name}</Text>
                    <View style={[styles.roleBadge, { backgroundColor: (ROLE_COLOR[m.teamRole] ?? '#9CA3AF') + '18' }]}>
                      <Text style={[styles.roleBadgeText, { color: ROLE_COLOR[m.teamRole] ?? '#9CA3AF' }]}>
                        {m.teamRole}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.memberEmail}>{m.email}</Text>
                  {m.status === 'pending' && (
                    <Text style={styles.pendingText}>Invitation pending</Text>
                  )}
                </View>
                {m.teamRole !== 'owner' && (
                  <Pressable onPress={() => handleRemove(m)} disabled={removing === m.id}>
                    {removing === m.id
                      ? <ActivityIndicator size="small" color="#DC2626" />
                      : <Icon name="UserMinus" size={18} color="#DC2626" />
                    }
                  </Pressable>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Invite modal */}
      <Modal visible={showAdd} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowAdd(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Invite Team Member</Text>

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={invite.name}
            onChangeText={(v) => setInvite((i) => ({ ...i, name: v }))}
            placeholder="Aisha Adebayo"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={invite.email}
            onChangeText={(v) => setInvite((i) => ({ ...i, email: v }))}
            placeholder="ada@company.ng"
            placeholderTextColor="#9CA3AF"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Role</Text>
          <View style={styles.roleGrid}>
            {TEAM_ROLES.map((r) => (
              <Pressable
                key={r.key}
                style={[styles.roleCard, invite.teamRole === r.key && styles.roleCardActive]}
                onPress={() => setInvite((i) => ({ ...i, teamRole: r.key }))}
              >
                <Text style={[styles.roleCardLabel, invite.teamRole === r.key && styles.roleCardLabelActive]}>
                  {r.label}
                </Text>
                <Text style={[styles.roleCardDesc, invite.teamRole === r.key && styles.roleCardDescActive]}>
                  {r.desc}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.inviteBtn, (!invite.name || !invite.email || inviting) && styles.inviteBtnDisabled]}
            onPress={handleInvite}
            disabled={!invite.name || !invite.email || inviting}
          >
            {inviting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.inviteBtnText}>Send Invitation</Text>
            }
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header:      {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  heading:     { fontSize: 20, fontWeight: '800', color: '#0F2B4C' },
  addBtn:      {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0F2B4C', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnText:  { color: '#fff', fontWeight: '700', fontSize: 13 },
  legendCard:  { backgroundColor: '#fff', margin: 16, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' },
  legendTitle: { fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  legendGrid:  { gap: 10 },
  legendRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  roleDot:     { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  roleLabel:   { fontSize: 13, fontWeight: '700', color: '#0F2B4C' },
  roleDesc:    { fontSize: 11, color: '#6B7280', marginTop: 1 },
  empty:       { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText:   { fontSize: 15, fontWeight: '600', color: '#374151' },
  emptySub:    { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  memberCard:  {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  avatar:      {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#3A7BD5',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:  { fontSize: 16, fontWeight: '800', color: '#fff' },
  memberTop:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  memberName:  { fontSize: 14, fontWeight: '700', color: '#0F2B4C' },
  roleBadge:   { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  roleBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  memberEmail: { fontSize: 12, color: '#6B7280' },
  pendingText: { fontSize: 11, color: '#D97706', marginTop: 2, fontWeight: '600' },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:       {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingTop: 12,
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle:  { fontSize: 18, fontWeight: '800', color: '#0F2B4C', marginBottom: 20 },
  label:       { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input:       {
    backgroundColor: '#F5F5F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: '#E5E7EB', fontSize: 15, color: '#0F2B4C', marginBottom: 14,
  },
  roleGrid:    { gap: 8, marginBottom: 20 },
  roleCard:    {
    padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#F5F5F0',
  },
  roleCardActive:    { borderColor: '#0F2B4C', backgroundColor: '#F0F5FF' },
  roleCardLabel:     { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 2 },
  roleCardLabelActive: { color: '#0F2B4C' },
  roleCardDesc:      { fontSize: 12, color: '#9CA3AF' },
  roleCardDescActive: { color: '#6B7280' },
  inviteBtn:         { backgroundColor: '#0F2B4C', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  inviteBtnDisabled: { opacity: 0.4 },
  inviteBtnText:     { color: '#fff', fontWeight: '700', fontSize: 16 },
});

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  ShieldCheck, 
  UserPlus, 
  Check, 
  X, 
  Lock, 
  CheckCircle, 
  AlertCircle,
  Save,
  Key
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { User, Role, UserRole } from '../../types';
import { collection, onSnapshot, setDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';

export const UserManagement: React.FC = () => {
  const { isOwner } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    roleId: 'waiter' as UserRole
  });
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const list: User[] = [];
      snap.forEach((d) => list.push({ uid: d.id, ...d.data() } as User));
      setUsers(list);
    });

    const unsubRoles = onSnapshot(collection(db, 'roles'), (snap) => {
      const list: Role[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Role));
      setRoles(list);
    });

    return () => {
      unsubUsers();
      unsubRoles();
    };
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name.trim() || !newUser.email.trim()) {
      setNotification({ type: 'error', message: 'Name and email are required.' });
      return;
    }

    try {
      const uid = `user_${Date.now()}`;
      const userData: User = {
        uid,
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        roleId: newUser.roleId,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await setDoc(doc(db, 'users', uid), userData);
      setModalOpen(false);
      setNewUser({ name: '', email: '', roleId: 'waiter' });
      setNotification({ type: 'success', message: `User "${userData.name}" added successfully.` });
      setTimeout(() => setNotification(null), 3000);
    } catch (e: any) {
      setNotification({ type: 'error', message: 'Failed to add user.' });
    }
  };

  const handleChangeRole = async (userId: string, newRole: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        roleId: newRole,
        updatedAt: Date.now()
      });
      setNotification({ type: 'success', message: 'User role updated.' });
      setTimeout(() => setNotification(null), 2500);
    } catch (e) {
      setNotification({ type: 'error', message: 'Failed to update role.' });
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        active: !currentActive,
        updatedAt: Date.now()
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-3 sm:p-4 gap-4 overflow-y-auto">
      
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-amber-400" />
          <div>
            <h2 className="font-bold text-sm sm:text-base tracking-wide text-slate-100">
              Role-Based Access Control (RBAC) & Staff
            </h2>
            <p className="text-xs text-slate-400">Strict permission boundaries for Owners, Managers, and Waiters</p>
          </div>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
        >
          <UserPlus className="w-4 h-4" /> Add Staff User
        </button>
      </div>

      {/* Notifications */}
      {notification && (
        <div className={`px-4 py-2 rounded-lg text-xs flex items-center gap-2 ${
          notification.type === 'success'
            ? 'bg-emerald-950 border border-emerald-500/40 text-emerald-300'
            : 'bg-red-950 border border-red-500/40 text-red-300'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* 2 Sections: Users Table + Permissions Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Left: Staff Accounts Table (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md flex flex-col">
          <div className="p-3 bg-slate-850 border-b border-slate-800 font-bold text-xs text-slate-300">
            Registered Staff Accounts ({users.length})
          </div>

          <div className="p-3 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <tr>
                  <th className="pb-2 pl-2">Name & Email</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2 text-center">Status</th>
                  <th className="pb-2 text-center pr-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-800/40">
                    <td className="py-3 pl-2">
                      <div className="font-semibold text-slate-200">{u.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                    </td>
                    <td className="py-3">
                      <select
                        value={u.roleId}
                        onChange={(e) => handleChangeRole(u.uid, e.target.value as UserRole)}
                        className="bg-slate-950 border border-slate-700 text-xs font-bold text-amber-300 rounded px-2 py-1 focus:outline-none"
                      >
                        <option value="owner">Owner (Full)</option>
                        <option value="manager">Manager</option>
                        <option value="waiter">Waiter (KOT)</option>
                      </select>
                    </td>
                    <td className="py-3 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        u.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                      }`}>
                        {u.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-3 text-center pr-2">
                      <button
                        onClick={() => handleToggleActive(u.uid, u.active)}
                        className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
                      >
                        {u.active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Permissions Reference Matrix (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3">
          <h3 className="font-bold text-xs text-slate-300 uppercase tracking-wider">
            RBAC Permission Capabilities Matrix
          </h3>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-slate-950 rounded-lg border border-amber-500/30">
              <div className="font-bold text-amber-400">👑 OWNER</div>
              <p className="text-[11px] text-slate-400 mt-1">
                Full unrestricted master access: Direct Billing, POS, KOTs, Bill Cancellation & Thermal Reprint, Menu CRUD, Inventory Management, Sales Revenue & Analytics Reports, User RBAC Management, Restaurant Settings.
              </p>
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-blue-500/30">
              <div className="font-bold text-blue-400">💼 MANAGER</div>
              <p className="text-[11px] text-slate-400 mt-1">
                Operational store supervisor: Direct Billing, POS, KOTs, Bill Reprint, Menu Item editing, Inventory adjustments. Revenue totals can be restricted.
              </p>
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-emerald-500/30">
              <div className="font-bold text-emerald-400">🍽️ WAITER</div>
              <p className="text-[11px] text-slate-400 mt-1">
                Floor service: Create Kitchen Order Tickets (KOT), modify active table items, view running kitchen status, trigger slip printing. Restricted from reports, menu pricing edits, and cancellations.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Add User Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-850 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-sm text-slate-100">Add Staff Member</h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-1">STAFF NAME *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">EMAIL ADDRESS *</label>
                <input
                  type="email"
                  required
                  placeholder="staff@hotelpos.internal"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-400 mb-1">ASSIGNED ROLE *</label>
                <select
                  value={newUser.roleId}
                  onChange={(e) => setNewUser({ ...newUser, roleId: e.target.value as UserRole })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="waiter">Waiter (KOT focused)</option>
                  <option value="manager">Manager (Operations)</option>
                  <option value="owner">Owner (Full access)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" /> Save Staff User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

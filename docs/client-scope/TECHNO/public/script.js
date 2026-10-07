// --- 1. Firebase Initialization ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, sendEmailVerification, EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where, arrayUnion, arrayRemove, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAXD9JEI5QJPJwiW37sprPzzzlyTc1Dt5s",
    authDomain: "soar-a711e.firebaseapp.com",
    projectId: "soar-a711e",
    storageBucket: "soar-a711e.firebasestorage.app",
    messagingSenderId: "65515950001",
    appId: "1:65515950001:web:ebc5b949216ece99f77790",
    measurementId: "G-9SB7M3GTK1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUserProfile = null;
window.openCommentSections = window.openCommentSections || new Set();
window.isRegistering = false; 

document.addEventListener('click', async (e) => {
    const logoutBtn = e.target.closest('.logout-btn');
    if (logoutBtn || e.target.innerText === 'Logout') {
        e.preventDefault();
        await signOut(auth);
        localStorage.removeItem('soarUserRole');
        window.location.href = 'index.html';
    }
});

document.addEventListener("DOMContentLoaded", () => {
    const currentPage = window.location.pathname;

    onAuthStateChanged(auth, async (user) => {
        if (window.isRegistering) return; 

        const isAuthPage = currentPage.endsWith('index.html') || currentPage.endsWith('register.html') || currentPage === '/' || currentPage.endsWith('/SOAR/');

        if (!user) {
            if (!isAuthPage) window.location.href = 'index.html';
            return;
        }

        try {
            const profileSnap = await getDoc(doc(db, "profiles", user.uid));
            if (profileSnap.exists()) {
                currentUserProfile = profileSnap.data();
                currentUserProfile.uid = user.uid;
                currentUserProfile.role = (currentUserProfile.role || 'student').toLowerCase(); 

                if (isAuthPage) { window.location.href = 'announcements.html'; return; }
                setupSmartNavigation(currentUserProfile.role);
                initializePageFeatures(currentPage);
            }
        } catch (error) { console.error("Database error:", error); }
    });

    const userTypeRadios = document.querySelectorAll('input[name="user_type"]');
    const fieldStudent = document.getElementById('field-student');
    const fieldSponsor = document.getElementById('field-sponsor');
    const fieldOrg = document.getElementById('field-organization');

    if (userTypeRadios.length > 0) {
        userTypeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const role = e.target.value;
                if(fieldStudent) fieldStudent.style.display = 'none';
                if(fieldSponsor) fieldSponsor.style.display = 'none';
                if(fieldOrg) fieldOrg.style.display = 'none';
                if (role === 'student' && fieldStudent) fieldStudent.style.display = 'block';
                if (role === 'sponsor' && fieldSponsor) fieldSponsor.style.display = 'block';
                if (role === 'organization' && fieldOrg) fieldOrg.style.display = 'block';
            });
        });
    }

    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            window.isRegistering = true; 
            const submitBtn = registerForm.querySelector('button[type="submit"]');
            submitBtn.innerText = "Registering...";
            submitBtn.disabled = true;

            try {
                const fullName = document.getElementById('reg-name').value.trim();
                const email = document.getElementById('reg-email').value.trim();
                const password = document.getElementById('reg-password').value.trim();
                const selectedRoleInput = document.querySelector('input[name="user_type"]:checked');
                const role = selectedRoleInput ? selectedRoleInput.value.toLowerCase() : 'student';

                let identificationNumber = "";
                let proofBase64 = null;

                if (role === 'student') identificationNumber = document.getElementById('reg-student-id')?.value.trim();
                if (role === 'sponsor') identificationNumber = document.getElementById('reg-tin')?.value.trim();
                if (role === 'organization') {
                    identificationNumber = document.getElementById('reg-org-id')?.value.trim();
                    const proofFile = document.getElementById('reg-org-proof')?.files[0];
                    if (proofFile) {
                        const reader = new FileReader();
                        reader.readAsDataURL(proofFile);
                        await new Promise(resolve => { reader.onload = () => { proofBase64 = reader.result; resolve(); }; });
                    }
                }

               const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Save to Database FIRST
                await setDoc(doc(db, "profiles", user.uid), {
                    id: user.uid, full_name: fullName, role: role, email: email, identification_number: identificationNumber, last_name_change: new Date(0)
                });

                if (role === 'organization') {
                    await setDoc(doc(db, "organizations", user.uid), {
                        org_name: fullName, bio: "Official profile.", contact: email, owner_id: user.uid,
                        accreditation_id: identificationNumber, proof_of_election: proofBase64, org_pic: null,
                        app_link: "", app_position: ""
                    });
                }

                // Send the verification email quietly AFTER saving to the database
                try {
                    await sendEmailVerification(user);
                } catch (emailErr) {
                    console.log("Verification email bypassed/delayed.");
                }

                await signOut(auth);
                window.isRegistering = false;
                alert('Account created successfully! You can now log in.');
                window.location.href = 'index.html'; 
            } catch (error) { 
                window.isRegistering = false; 
                submitBtn.innerText = "Register";
                submitBtn.disabled = false;
                alert('Registration Error: ' + error.message); 
            }
        });
    }

    // --- Login Form (Gatekeeper Removed) ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value.trim();
            const selectedLoginRoleInput = document.querySelector('#login-form input[type="radio"]:checked');
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            submitBtn.innerText = "Logging in...";
            submitBtn.disabled = true;

            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const profileSnap = await getDoc(doc(db, "profiles", userCredential.user.uid));
                
                if (profileSnap.exists()) {
                    const actualRole = profileSnap.data().role.toLowerCase();
                    if (selectedLoginRoleInput && actualRole !== selectedLoginRoleInput.value.toLowerCase()) {
                        await signOut(auth); 
                        submitBtn.innerText = "Login"; submitBtn.disabled = false;
                        alert(`ACCESS DENIED: Role mismatch.`); 
                        return;
                    }
                } else { 
                    await signOut(auth); 
                    submitBtn.innerText = "Login"; submitBtn.disabled = false;
                    alert("Profile missing."); 
                    return; 
                }
            } catch (error) { 
                submitBtn.innerText = "Login"; submitBtn.disabled = false;
                alert('Login failed: Invalid email or password.'); 
            }
        });
    }

    const forgotPasswordLink = document.getElementById('forgot-password-link');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', async (e) => {
            e.preventDefault();
            let email = document.getElementById('login-email')?.value.trim();
            if (!email) { email = prompt("Please enter your registered email address to reset your password:"); }
            if (!email) return;
            try {
                await sendPasswordResetEmail(auth, email);
                alert(`Success! A password reset link has been sent to: ${email}\n\nPlease check your inbox and spam folder.`);
            } catch (error) {
                if (error.code === 'auth/invalid-email') alert("Please enter a valid email address.");
                else if (error.code === 'auth/user-not-found') alert("No account found with this email address.");
                else alert("Error: " + error.message);
            }
        });
    }

    function setupSmartNavigation(role) {
        const nav = document.querySelector('.nav-links');
        if (!nav) return;
        if (role === 'organization') {
            nav.innerHTML = `<a href="org-dashboard.html">My Dashboard</a> <a href="org-applications.html">Applications</a> <a href="announcements.html">Announcements</a> <a href="organizations.html">Organizations</a> <a href="#" class="logout-btn">Logout</a>`;
        } else if (role === 'sponsor') {
            nav.innerHTML = `<a href="announcements.html">Announcements</a> <a href="organizations.html">Organizations</a> <a href="settings.html">Settings</a> <a href="#" class="logout-btn">Logout</a>`;
        } else {
            nav.innerHTML = `<a href="announcements.html">Announcements</a> <a href="organizations.html">Organizations</a> <a href="application.html">Applications</a> <a href="settings.html">Settings</a> <a href="#" class="logout-btn">Logout</a>`;
        }
    }

    function initializePageFeatures(page) {
        if (page.includes('announcements.html')) loadAnnouncements();
        if (page.includes('organizations.html')) { loadOrganizationsList(); loadUserMeetings(); }
        if (page.includes('application.html')) { loadStudentApplications(); loadUserMeetings(); }
        if (page.includes('org-applications.html')) loadOrgApplications();
        if (page.includes('org-dashboard')) { loadOrgDashboard(); loadAnnouncements(true); }
        if (page.includes('org-profile.html')) loadOrgProfile();
        if (page.includes('settings.html')) loadSettingsPage();
    }

    async function loadSettingsPage() {
        if (currentUserProfile.role === 'organization') { window.location.href = 'org-dashboard.html'; return; }

        const nameForm = document.getElementById('change-name-form');
        const emailForm = document.getElementById('change-email-form');
        const nameInput = document.getElementById('new-name-input');
        const cooldownMsg = document.getElementById('name-cooldown-msg');
        
        if (nameInput) nameInput.value = currentUserProfile.full_name;

        if (nameForm) {
            nameForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const newName = nameInput.value.trim();
                if (newName === currentUserProfile.full_name) { alert("This is already your name!"); return; }

                try {
                    const profileRef = doc(db, "profiles", currentUserProfile.uid);
                    const profileSnap = await getDoc(profileRef);
                    const data = profileSnap.data();
                    
                    const lastChange = data.last_name_change ? data.last_name_change.toMillis() : 0;
                    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
                    const timeSinceChange = Date.now() - lastChange;

                    if (timeSinceChange < thirtyDaysInMs) {
                        const daysLeft = Math.ceil((thirtyDaysInMs - timeSinceChange) / (1000 * 60 * 60 * 24));
                        cooldownMsg.innerText = `You must wait ${daysLeft} more days before changing your name again.`;
                        cooldownMsg.style.display = 'block';
                        return;
                    }

                    document.getElementById('btn-change-name').innerText = "Updating...";
                    await updateDoc(profileRef, { full_name: newName, last_name_change: new Date() });
                    
                    currentUserProfile.full_name = newName;
                    alert("Name successfully updated!");
                    cooldownMsg.style.display = 'none';
                    document.getElementById('btn-change-name').innerText = "Update Name";
                } catch (err) {
                    console.error("Error updating name:", err);
                    alert("Failed to update name.");
                    document.getElementById('btn-change-name').innerText = "Update Name";
                }
            });
        }

        if (emailForm) {
            emailForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const currentPassword = document.getElementById('current-password-email').value;
                const newEmail = document.getElementById('new-email-input').value.trim();
                const btn = document.getElementById('btn-change-email');

                if (newEmail === currentUserProfile.email) { alert("This is already your email address."); return; }

                try {
                    btn.innerText = "Authenticating..."; btn.disabled = true;

                    const user = auth.currentUser;
                    const credential = EmailAuthProvider.credential(user.email, currentPassword);
                    await reauthenticateWithCredential(user, credential);

                    btn.innerText = "Sending Link...";
                    await verifyBeforeUpdateEmail(user, newEmail);
                    await updateDoc(doc(db, "profiles", currentUserProfile.uid), { email: newEmail });

                    alert(`Success! A verification link has been sent to ${newEmail}.\n\nPlease log in to that email to confirm the change. Your old email will be used until verification is complete.`);
                    emailForm.reset();
                } catch (err) {
                    console.error("Email update error:", err);
                    if (err.code === 'auth/invalid-credential') alert("Incorrect current password.");
                    else if (err.code === 'auth/email-already-in-use') alert("That email is already registered to another account.");
                    else alert("Error: " + err.message);
                } finally {
                    btn.innerText = "Send Verification Link"; btn.disabled = false;
                }
            });
        }
    }

    async function loadOrganizationsList() {
        const list = document.getElementById('organizations-list');
        const search = document.getElementById('org-search');
        if (!list) return;
        try {
            const snap = await getDocs(collection(db, "organizations"));
            list.innerHTML = '';
            snap.forEach(docSnap => {
                const org = docSnap.data();
                list.innerHTML += `
                    <div class="org-card" style="padding: 2.5rem; text-align: center; display: flex; flex-direction: column; align-items: center;">
                        <img src="${org.org_pic || 'https://via.placeholder.com/80'}" style="width:85px; height:85px; border-radius:50%; object-fit:cover; margin-bottom:1.2rem; border: 3px solid var(--primary-purple);">
                        <h3 class="org-name-title" style="margin-bottom:0.5rem;">${org.org_name}</h3>
                        <p style="margin-bottom:1.5rem; font-size:0.9rem;">${org.bio}</p>
                        <a href="org-profile.html?id=${docSnap.id}" class="btn-primary" style="text-decoration:none; width:100%; text-align: center;">Visit Profile</a>
                    </div>
                `;
            });
            if (search) search.addEventListener('input', function() {
                const filter = this.value.toLowerCase();
                list.querySelectorAll('.org-card').forEach(card => {
                    card.style.display = card.querySelector('.org-name-title').innerText.toLowerCase().includes(filter) ? 'flex' : 'none';
                });
            });
        } catch (err) { console.error("Error loading directory:", err); }
    }

    async function loadUserMeetings() {
        const isAppPage = window.location.pathname.includes('application.html');
        const isOrgPage = window.location.pathname.includes('organizations.html');
        let tbody, container;

        if (isAppPage && currentUserProfile.role === 'student') {
            tbody = document.querySelector('#student-meetings-table tbody');
            container = document.getElementById('student-meetings-container');
            if (container) container.style.display = 'block';
        } else if (isOrgPage && currentUserProfile.role === 'sponsor') {
            tbody = document.querySelector('#user-meetings-table tbody');
            container = document.getElementById('user-meetings-container');
            if (container) container.style.display = 'block';
        } else {
            container = document.getElementById('user-meetings-container');
            if (container) container.style.display = 'none';
            return;
        }
        if (!tbody) return;

        try {
            const q = query(collection(db, "appointments"), where("student_id", "==", currentUserProfile.uid));
            const snapshot = await getDocs(q);
            tbody.innerHTML = '';
            if (snapshot.empty) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 1rem;">No meeting requests.</td></tr>`; return; }
            snapshot.forEach(docSnap => {
                const req = docSnap.data();
                tbody.innerHTML += `<tr><td style="padding:1rem;">${req.org_name}</td><td style="padding:1rem;">${req.event_title} (${req.event_date})</td><td style="padding:1rem; font-weight:bold; color:var(--primary-purple);">${req.time}</td><td style="padding:1rem;"><span class="status-chip">${req.status.toUpperCase()}</span></td></tr>`;
            });
        } catch (err) { console.error("Error loading meetings:", err); }
    }

    function renderPosts(docsArray, feedElement, isDashboard = false, reloadCallback) {
        feedElement.innerHTML = '';
        if (docsArray.length === 0) { feedElement.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 2rem;">No announcements found.</p>`; return; }

        docsArray.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        docsArray.forEach(post => {
            const likes = post.likes || [];
            const comments = post.comments || [];
            const hasLiked = likes.includes(currentUserProfile.uid);
            const isCommentOpen = window.openCommentSections.has(post.id);

            let postDate = "Recently";
            if (post.timestamp && typeof post.timestamp.toDate === 'function') {
                postDate = post.timestamp.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            }

            const commentsHtml = comments.map(c => `<div style="background: var(--secondary-bg); padding: 1rem; border-radius: 14px; margin-bottom: 0.5rem;"><strong>${c.name}:</strong> ${c.text}</div>`).join('');
            const imageHtml = post.image_url ? `<img src="${post.image_url}" style="width: 100%; border-radius: 16px; margin-top: 1rem; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">` : '';

            feedElement.innerHTML += `
                <div class="post-card" style="padding: 2rem; margin-bottom: 1.5rem;" data-id="${post.id}">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <a href="org-profile.html?id=${post.org_id}" class="post-header-link" style="display: flex; gap: 15px; align-items: center; text-decoration: none; color: inherit;">
                            <img src="${post.org_pic || 'https://via.placeholder.com/50'}" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border: 2px solid var(--primary-purple); transition: all 0.3s ease;">
                            <div style="display: flex; flex-direction: column;">
                                <strong class="org-name-title" style="font-size:1.1rem; color:var(--text-dark); transition: color 0.3s ease;">${post.org_name}</strong>
                                <span class="post-date">${postDate}</span>
                            </div>
                        </a>
                        ${isDashboard ? `<button class="delete-post-btn action-btn" data-id="${post.id}" style="background: rgba(255, 179, 198, 0.2) !important; color: var(--accent-pink) !important; padding: 0.4rem 1rem !important; font-size: 0.85rem; box-shadow: none !important;">Delete</button>` : ''}
                    </div>
                    <p style="margin-top: 1.5rem; line-height: 1.6; font-size: 0.95rem;">${post.content}</p>
                    ${imageHtml}
                    <div style="margin-top: 1.5rem; border-top: 2px solid var(--secondary-bg); padding-top: 1rem; display: flex; gap: 1rem;">
                        <button class="like-btn" data-id="${post.id}" style="background:none; border:none; cursor:pointer; font-weight:600; font-family: 'Poppins', sans-serif; color: ${hasLiked ? 'var(--primary-purple)' : 'var(--text-muted)'}; transition: color 0.2s ease;">
                            ${hasLiked ? '❤️ Liked' : '🤍 Like'} (${likes.length})
                        </button>
                        <button class="comment-btn" data-id="${post.id}" style="background:none; border:none; cursor:pointer; font-weight:600; font-family: 'Poppins', sans-serif; color: var(--text-muted); transition: color 0.2s ease;">
                            💬 Comments (${comments.length})
                        </button>
                    </div>
                    <div class="post-comments" style="display: ${isCommentOpen ? 'block' : 'none'}; margin-top: 1.5rem;">
                        ${commentsHtml}
                        <div style="display: flex; gap: 0.8rem; margin-top: 1rem;">
                            <input type="text" id="comment-input-${post.id}" style="flex:1;" placeholder="Write a comment...">
                            <button class="btn-primary post-comment-btn" data-id="${post.id}">Post</button>
                        </div>
                    </div>
                </div>
            `;
        });

        if (!feedElement.hasAttribute('data-listening')) {
            feedElement.setAttribute('data-listening', 'true');
            feedElement.addEventListener('click', async (e) => {
                if (e.target.classList.contains('like-btn')) {
                    const pid = e.target.getAttribute('data-id');
                    const postRef = doc(db, "announcements", pid);
                    const postSnap = await getDoc(postRef);
                    if (postSnap.exists()) {
                        if ((postSnap.data().likes || []).includes(currentUserProfile.uid)) await updateDoc(postRef, { likes: arrayRemove(currentUserProfile.uid) });
                        else await updateDoc(postRef, { likes: arrayUnion(currentUserProfile.uid) });
                        reloadCallback();
                    }
                }
                if (e.target.classList.contains('comment-btn')) {
                    const pid = e.target.getAttribute('data-id');
                    const section = e.target.closest('.post-card').querySelector('.post-comments');
                    if (section.style.display === 'block') { section.style.display = 'none'; window.openCommentSections.delete(pid); }
                    else { section.style.display = 'block'; window.openCommentSections.add(pid); }
                }
                if (e.target.classList.contains('post-comment-btn')) {
                    const pid = e.target.getAttribute('data-id');
                    const input = document.getElementById(`comment-input-${pid}`);
                    if (!input.value.trim()) return;
                    window.openCommentSections.add(pid);
                    await updateDoc(doc(db, "announcements", pid), { comments: arrayUnion({ uid: currentUserProfile.uid, name: currentUserProfile.full_name, text: input.value.trim() }) });
                    reloadCallback();
                }
                if (e.target.classList.contains('delete-post-btn')) {
                    if (confirm("Delete permanently? This removes the post globally.")) {
                        try {
                            e.target.innerText = "Deleting..."; e.target.disabled = true;
                            await deleteDoc(doc(db, "announcements", e.target.getAttribute('data-id')));
                            reloadCallback();
                        } catch(err) { console.error("Error deleting", err); }
                    }
                }
            });
        }
    }

    async function loadAnnouncements(isDashboard = false) {
        const feed = document.getElementById(isDashboard ? 'live-feed' : 'announcements-feed');
        if (!feed) return;
        try {
            const q = isDashboard ? query(collection(db, "announcements"), where("org_id", "==", currentUserProfile.uid)) : collection(db, "announcements");
            const snapshot = await getDocs(q);
            const docsArray = [];
            snapshot.forEach(d => {
                if(d.data().org_id !== 'deleted') docsArray.push({ id: d.id, ...d.data() }); 
            });
            renderPosts(docsArray, feed, isDashboard, () => loadAnnouncements(isDashboard));
        } catch (err) { console.error("Error:", err); }
    }

    async function loadOrgDashboard() {
        try {
            const orgRef = doc(db, "organizations", currentUserProfile.uid);
            let currentOrgPic = null;
            let currentOrgName = currentUserProfile.full_name;

            const form = document.getElementById('profile-settings-form');
            if (form) {
                const snap = await getDoc(orgRef);
                if (snap.exists()) {
                    const data = snap.data();
                    currentOrgName = data.org_name || currentUserProfile.full_name;
                    
                    if(document.getElementById('edit-org-name')) document.getElementById('edit-org-name').value = data.org_name || '';
                    if(document.getElementById('edit-org-bio')) document.getElementById('edit-org-bio').value = data.bio || '';
                    if(document.getElementById('edit-org-email')) document.getElementById('edit-org-email').value = data.contact || '';
                    if(document.getElementById('edit-org-position')) document.getElementById('edit-org-position').value = data.app_position || '';
                    if(document.getElementById('edit-org-link')) document.getElementById('edit-org-link').value = data.app_link || '';
                    
                    currentOrgPic = data.org_pic || null;
                }

                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const submitBtn = form.querySelector('button[type="submit"]');
                    submitBtn.innerText = "Saving..."; submitBtn.disabled = true;

                    try {
                        let picBase64 = currentOrgPic;
                        const picInput = document.getElementById('edit-org-pic');
                        if (picInput && picInput.files.length > 0) {
                            const file = picInput.files[0];
                            if (file.size > 1048576) { alert("Image limit 1MB."); submitBtn.innerText = "Save Settings"; submitBtn.disabled = false; return; }
                            const reader = new FileReader();
                            reader.readAsDataURL(file);
                            await new Promise(resolve => { reader.onload = () => { picBase64 = reader.result; resolve(); }; });
                        }
                        
                        let updateData = { org_pic: picBase64 };
                        if(document.getElementById('edit-org-name')) updateData.org_name = document.getElementById('edit-org-name').value.trim();
                        if(document.getElementById('edit-org-bio')) updateData.bio = document.getElementById('edit-org-bio').value.trim();
                        if(document.getElementById('edit-org-email')) updateData.contact = document.getElementById('edit-org-email').value.trim();
                        if(document.getElementById('edit-org-position')) updateData.app_position = document.getElementById('edit-org-position').value.trim();
                        if(document.getElementById('edit-org-link')) updateData.app_link = document.getElementById('edit-org-link').value.trim();

                        await setDoc(orgRef, updateData, { merge: true });
                        if(updateData.org_name) await updateDoc(doc(db, "profiles", currentUserProfile.uid), { full_name: updateData.org_name });
                        
                        alert("Profile Settings Saved Successfully!");
                    } catch (err) {
                        console.error(err);
                        alert("Failed to save.");
                    } finally {
                        submitBtn.innerText = "Save Settings"; submitBtn.disabled = false;
                    }
                });
            }

            const postForm = document.getElementById('create-post-form');
            if (postForm) {
                postForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const btn = postForm.querySelector('button');
                    btn.innerText = "Posting..."; btn.disabled = true;
                    
                    const content = document.getElementById('post-text').value;
                    const fileInput = document.getElementById('post-image');
                    const savePost = async (img) => {
                        await addDoc(collection(db, "announcements"), { org_id: currentUserProfile.uid, org_name: currentOrgName, org_pic: currentOrgPic, content: content, image_url: img, timestamp: new Date(), likes: [], comments: [] });
                        alert("Posted!"); postForm.reset(); btn.innerText = "Post Announcement"; btn.disabled = false; loadAnnouncements(true);
                    };
                    if (fileInput && fileInput.files.length > 0) {
                        const reader = new FileReader(); reader.onloadend = async () => await savePost(reader.result); reader.readAsDataURL(fileInput.files[0]);
                    } else await savePost(null);
                });
            }

            const eventForm = document.getElementById("create-event-form");
            if (eventForm) {
                eventForm.addEventListener("submit", async (e) => {
                    e.preventDefault();
                    const btn = eventForm.querySelector('button');
                    btn.innerText = "Adding..."; btn.disabled = true;

                    const title = document.getElementById("event-title").value.trim();
                    await addDoc(collection(db, "calendar_events"), { org_id: currentUserProfile.uid, title: title, date: document.getElementById("event-date").value, timestamp: new Date() });
                    alert("Slot added!"); eventForm.reset(); btn.innerText = "Add Slot"; btn.disabled = false; loadOrgSlotsList();
                });
            }

            loadMeetingRequests(); loadOrgSlotsList();
        } catch (err) { console.error("Dashboard error:", err); }
    }

    async function loadOrgSlotsList() {
        const slotsContainer = document.getElementById('org-calendar-slots-list');
        if (!slotsContainer) return;
        try {
            const q = query(collection(db, "calendar_events"), where("org_id", "==", currentUserProfile.uid));
            const snapshot = await getDocs(q);
            slotsContainer.innerHTML = '';
            
            if (snapshot.empty) { slotsContainer.innerHTML = `<p style="color:var(--text-muted); font-size: 0.95rem;">No active slots.</p>`; return; }
            
            snapshot.forEach(docSnap => {
                const ev = docSnap.data();
                slotsContainer.innerHTML += `
                    <div style="background: var(--secondary-bg); padding: 1.2rem; border-radius: 16px; display: flex; justify-content: space-between; align-items: center;">
                        <div><strong style="font-size: 1.05rem;">${ev.title}</strong><br><small style="color:var(--text-muted);">${ev.date}</small></div>
                        <button class="action-btn delete-slot-btn" data-id="${docSnap.id}" style="background: rgba(255, 179, 198, 0.2) !important; color: var(--accent-pink) !important; padding: 0.4rem 0.8rem !important; font-size: 0.8rem; box-shadow: none !important;">Delete</button>
                    </div>
                `;
            });
            
            slotsContainer.querySelectorAll('.delete-slot-btn').forEach(btn => {
                btn.addEventListener('click', async function() {
                    if (confirm("Remove this slot permanently?")) {
                        try {
                            this.innerText = "Deleting..."; this.disabled = true;
                            await deleteDoc(doc(db, "calendar_events", this.getAttribute('data-id')));
                            loadOrgSlotsList();
                        } catch(err) { console.error(err); alert("Error deleting slot."); }
                    }
                });
            });
        } catch(err) { console.error(err); }
    }

    async function loadMeetingRequests() {
        const tbody = document.querySelector('#meeting-requests-table tbody');
        if (!tbody) return;
        try {
            const q = query(collection(db, "appointments"), where("org_id", "==", currentUserProfile.uid));
            const snapshot = await getDocs(q);
            tbody.innerHTML = '';
            if (snapshot.empty) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 1rem;">No requests.</td></tr>`; return; }
            snapshot.forEach(docSnap => {
                const req = docSnap.data();
                tbody.innerHTML += `<tr><td style="padding:1rem;">${req.student_name}</td><td style="padding:1rem;">${req.event_title} (${req.event_date})</td><td style="padding:1rem; font-weight:bold; color:var(--primary-purple);">${req.time || 'N/A'}</td><td style="padding:1rem;"><span class="status-chip">${req.status.toUpperCase()}</span></td>
                    <td style="padding:1rem;"><select class="status-dropdown" data-id="${docSnap.id}">
                        <option value="pending" ${req.status==='pending'?'selected':''}>Pending</option>
                        <option value="approved" ${req.status==='approved'?'selected':''}>Approve</option>
                        <option value="declined" ${req.status==='declined'?'selected':''}>Decline</option>
                    </select></td></tr>`;
            });
            tbody.querySelectorAll('.status-dropdown').forEach(s => s.addEventListener('change', async (e) => {
                await updateDoc(doc(db, "appointments", e.target.getAttribute('data-id')), { status: e.target.value });
            }));
        } catch(err) { console.error(err); }
    }

    async function loadOrgProfile() {
        const urlParams = new URLSearchParams(window.location.search);
        const orgId = urlParams.get('id');
        if (!orgId) return;

        try {
            const orgSnap = await getDoc(doc(db, "organizations", orgId));
            let orgData = null;
            if (orgSnap.exists()) {
                orgData = orgSnap.data();
                const titleEl = document.getElementById('profile-name');
                const bioEl = document.getElementById('profile-bio');
                const contactEl = document.getElementById('profile-contact');
                
                if(titleEl) titleEl.innerText = orgData.org_name || 'Organization';
                if(bioEl) bioEl.innerText = orgData.bio || '';
                if(contactEl) contactEl.innerText = `Contact: ${orgData.contact || ''}`;
                
                if (orgData.org_pic) {
                    const avatar = document.querySelector('.org-avatar');
                    if(avatar) { avatar.style.backgroundImage = `url(${orgData.org_pic})`; avatar.style.backgroundSize = 'cover'; }
                }
            }

            const appSection = document.getElementById('application-section');
            const applyBtn = document.getElementById('apply-btn');
            if (appSection && applyBtn) {
                if (orgData && orgData.app_link && orgData.app_position && currentUserProfile.role === 'student') {
                    appSection.style.display = 'block';
                    const recruitTitle = document.getElementById('recruit-title');
                    if(recruitTitle) recruitTitle.innerText = orgData.app_position;
                    applyBtn.style.display = 'block';
                    
                    const newBtn = applyBtn.cloneNode(true); applyBtn.parentNode.replaceChild(newBtn, applyBtn);
                    newBtn.addEventListener('click', async function() {
                        if (confirm(`Apply for "${orgData.app_position}"?`)) {
                            this.innerText = "Application Logged"; this.disabled = true;
                            await addDoc(collection(db, "applications"), { student_id: currentUserProfile.uid, applicant_name: currentUserProfile.full_name, org_id: orgId, org_name: orgData.org_name, position: orgData.app_position, status: 'pending', timestamp: new Date() });
                            window.open(orgData.app_link, '_blank');
                        }
                    });
                } else appSection.style.display = 'none';
            }

            const orgPostsFeed = document.getElementById('org-posts-feed');
            if (orgPostsFeed) {
                const loadOrgFeed = async () => {
                    try {
                        const snap = await getDocs(query(collection(db, "announcements"), where("org_id", "==", orgId)));
                        const docsArray = [];
                        snap.forEach(d => { if(d.data().org_id !== 'deleted') docsArray.push({ id: d.id, ...d.data() }); });
                        renderPosts(docsArray, orgPostsFeed, false, loadOrgFeed);
                    } catch(err) { console.error("Error loading feed:", err); }
                };
                loadOrgFeed();
            }

            const eventsSidebar = document.getElementById('events-sidebar');
            if (eventsSidebar) {
                const snapshot = await getDocs(query(collection(db, "calendar_events"), where("org_id", "==", orgId)));
                eventsSidebar.innerHTML = `<h3 style="margin-bottom: 1.5rem; font-size: 1.1rem; border-bottom: 2px solid var(--secondary-bg); padding-bottom: 0.5rem;">Available Slots</h3>`;
                if (snapshot.empty) { eventsSidebar.innerHTML += `<p style="color:var(--text-muted);">No slots scheduled.</p>`; }
                else {
                    snapshot.forEach(docSnap => {
                        const ev = docSnap.data();
                        eventsSidebar.innerHTML += `
                            <div class="event-card" style="background: var(--secondary-bg); padding: 1.5rem; border-radius: 16px; margin-bottom: 1.2rem;">
                                <h4 style="margin-bottom: 0.3rem;">${ev.title}</h4> <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">Suggested: ${ev.date}</p>
                                <input type="date" id="date-${docSnap.id}" style="width: 100%; margin-bottom: 0.8rem;">
                                <input type="time" id="time-${docSnap.id}" style="width: 100%; margin-bottom: 1rem;">
                                <button class="btn-primary book-event-btn" data-id="${docSnap.id}" data-title="${ev.title}" style="width: 100%;">Request Booking</button>
                            </div>`;
                    });
                    eventsSidebar.querySelectorAll('.book-event-btn').forEach(btn => {
                        btn.addEventListener('click', async function() {
                            const id = this.getAttribute('data-id');
                            const date = document.getElementById(`date-${id}`).value;
                            const time = document.getElementById(`time-${id}`).value;
                            if (!date || !time) return alert("Select date and time.");
                            this.innerText = "Sent"; this.disabled = true;
                            await addDoc(collection(db, "appointments"), { student_id: currentUserProfile.uid, student_name: currentUserProfile.full_name, org_id: orgId, org_name: orgData.org_name, event_title: this.getAttribute('data-title'), event_date: date, time: time, status: 'pending', timestamp: new Date() });
                            alert("Booking requested!");
                        });
                    });
                }
            }
        } catch (err) { console.error("Error loading profile:", err); }
    }

    async function loadOrgApplications() {
        const tbody = document.querySelector('.app-table tbody');
        if (!tbody) return;
        try {
            const snapshot = await getDocs(query(collection(db, "applications"), where("org_id", "==", currentUserProfile.uid)));
            tbody.innerHTML = '';
            if(snapshot.empty) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 1rem;">No applicants found.</td></tr>`; return;}
            snapshot.forEach(docSnap => {
                const app = docSnap.data();
                tbody.innerHTML += `<tr><td style="padding:1rem;">${app.applicant_name}</td><td style="padding:1rem;">${app.position}</td><td style="padding:1rem;"><span class="status-chip">${app.status.toUpperCase()}</span></td><td style="padding:1rem;">
                    <select class="status-dropdown" data-id="${docSnap.id}">
                        <option value="pending" ${app.status==='pending'?'selected':''}>Pending</option>
                        <option value="review" ${app.status==='review'?'selected':''}>Under Review</option>
                        <option value="accepted" ${app.status==='accepted'?'selected':''}>Accepted</option>
                    </select></td></tr>`;
            });
            tbody.querySelectorAll('.status-dropdown').forEach(s => s.addEventListener('change', async (e) => {
                await updateDoc(doc(db, "applications", e.target.getAttribute('data-id')), { status: e.target.value });
            }));
        } catch(err) { console.error(err); }
    }

    async function loadStudentApplications() {
        const tbody = document.querySelector('#student-apps-table tbody');
        if (!tbody) return;
        try {
            const snapshot = await getDocs(query(collection(db, "applications"), where("student_id", "==", currentUserProfile.uid)));
            tbody.innerHTML = '';
            if(snapshot.empty) { tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 1rem;">No applications submitted yet.</td></tr>`; return;}
            snapshot.forEach(docSnap => {
                const app = docSnap.data();
                tbody.innerHTML += `<tr><td style="padding:1rem;">${app.org_name}</td><td style="padding:1rem;">${app.position}</td><td style="padding:1rem;"><span class="status-chip">${app.status.toUpperCase()}</span></td></tr>`;
            });
        } catch(err) { console.error(err); }
    }
});
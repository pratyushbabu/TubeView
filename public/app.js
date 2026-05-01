const API_BASE = "/api/v1";
const state = {
  user: null,
  accessToken: localStorage.getItem("tubeviewAccessToken") || "",
  refreshToken: localStorage.getItem("tubeviewRefreshToken") || "",
  videos: [],
  pagination: null,
  query: "",
  sortBy: "createdAt",
  sortType: "desc",
};

const view = document.querySelector("#view");
const statusBox = document.querySelector("#status");
const authButton = document.querySelector("#authButton");
const authModal = document.querySelector("#authModal");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const authTitle = document.querySelector("#authTitle");

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char];
  });

const formatCount = (value = 0) =>
  Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "";

const formatDuration = (seconds = 0) => {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(safe / 60);
  const secs = String(safe % 60).padStart(2, "0");
  const hours = Math.floor(mins / 60);
  if (hours > 0)
    return `${hours}:${String(mins % 60).padStart(2, "0")}:${secs}`;
  return `${mins}:${secs}`;
};

const showStatus = (message, type = "info") => {
  statusBox.textContent = message;
  statusBox.className = `status ${type === "error" ? "error" : ""}`;
  statusBox.hidden = false;
  window.clearTimeout(showStatus.timer);
  showStatus.timer = window.setTimeout(() => {
    statusBox.hidden = true;
  }, 4500);
};

const setBusy = (isBusy) => {
  document.body.style.cursor = isBusy ? "progress" : "";
};

const saveTokens = (data = {}) => {
  if (data.accessToken) {
    state.accessToken = data.accessToken;
    localStorage.setItem("tubeviewAccessToken", data.accessToken);
  }
  if (data.refreshToken) {
    state.refreshToken = data.refreshToken;
    localStorage.setItem("tubeviewRefreshToken", data.refreshToken);
  }
};

const clearSession = () => {
  state.user = null;
  state.accessToken = "";
  state.refreshToken = "";
  localStorage.removeItem("tubeviewAccessToken");
  localStorage.removeItem("tubeviewRefreshToken");
};

const apiRequest = async (path, options = {}, retry = true) => {
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;

  if (!isFormData && options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (state.accessToken) {
    headers.set("Authorization", `Bearer ${state.accessToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
    headers,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = { message: response.statusText };
  }

  if (response.status === 401 && retry && state.refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequest(path, options, false);
    }
  }

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || "Request failed");
  }

  return payload;
};

const refreshAccessToken = async () => {
  try {
    const payload = await apiRequest(
      "/user/refresh-token",
      {
        method: "POST",
        body: JSON.stringify({ refreshToken: state.refreshToken }),
      },
      false
    );
    saveTokens(payload.data);
    return true;
  } catch {
    clearSession();
    updateAuthUi();
    return false;
  }
};

const updateAuthUi = () => {
  authButton.textContent = state.user ? state.user.username : "Sign in";
};

const requireAuth = () => {
  if (state.user) return true;
  openAuthModal("login");
  showStatus("Please sign in first.", "error");
  return false;
};

const videoCard = (video) => `
  <a class="video-card" href="#/watch/${video._id}">
    <div class="thumb">
      <img src="${escapeHtml(video.thumbnail)}" alt="${escapeHtml(video.title)} thumbnail" loading="lazy" />
      <span class="duration">${formatDuration(video.duration)}</span>
    </div>
    <div class="video-meta">
      <img class="avatar" src="${escapeHtml(video.owner?.avatar || "")}" alt="" loading="lazy" />
      <div>
        <h3 class="video-title line-clamp">${escapeHtml(video.title)}</h3>
        <div class="muted">${escapeHtml(video.owner?.fullName || video.owner?.username || "Channel")}</div>
        <div class="muted">${formatCount(video.views)} views • ${formatDate(video.createdAt)}</div>
      </div>
    </div>
  </a>
`;

const miniVideo = (video) => `
  <a class="mini-item" href="#/watch/${video._id}">
    <div class="thumb">
      <img src="${escapeHtml(video.thumbnail)}" alt="" loading="lazy" />
      <span class="duration">${formatDuration(video.duration)}</span>
    </div>
    <div>
      <h3 class="video-title line-clamp">${escapeHtml(video.title)}</h3>
      <div class="muted">${formatCount(video.views)} views</div>
    </div>
  </a>
`;

const renderEmpty = (message) =>
  `<div class="empty"><p>${escapeHtml(message)}</p></div>`;

const setActiveNav = (name) => {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.nav === name);
  });
};

const loadCurrentUser = async () => {
  if (!state.accessToken && !state.refreshToken) {
    updateAuthUi();
    return;
  }

  try {
    const payload = await apiRequest("/user/current-user");
    state.user = payload.data;
  } catch {
    clearSession();
  }
  updateAuthUi();
};

const loadVideos = async () => {
  const params = new URLSearchParams({
    page: "1",
    limit: "24",
    sortBy: state.sortBy,
    sortType: state.sortType,
  });
  if (state.query) params.set("query", state.query);

  const payload = await apiRequest(`/videos?${params}`);
  state.videos = payload.data.videos || [];
  state.pagination = payload.data.pagination;
};

const renderHome = async () => {
  setActiveNav("home");
  setBusy(true);
  try {
    await loadVideos();
    view.innerHTML = `
      <div class="section-head">
        <div>
          <h1>${state.query ? `Results for "${escapeHtml(state.query)}"` : "Latest videos"}</h1>
          <p>${state.pagination?.totalVideos || 0} videos available</p>
        </div>
        <div class="filters">
          <select id="sortBy" aria-label="Sort by">
            <option value="createdAt">Newest</option>
            <option value="views">Views</option>
            <option value="duration">Duration</option>
            <option value="title">Title</option>
          </select>
          <select id="sortType" aria-label="Sort direction">
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>
      ${
        state.videos.length
          ? `<div class="video-grid">${state.videos.map(videoCard).join("")}</div>`
          : renderEmpty("No videos found.")
      }
    `;
    document.querySelector("#sortBy").value = state.sortBy;
    document.querySelector("#sortType").value = state.sortType;
    document.querySelector("#sortBy").addEventListener("change", (event) => {
      state.sortBy = event.target.value;
      renderHome();
    });
    document.querySelector("#sortType").addEventListener("change", (event) => {
      state.sortType = event.target.value;
      renderHome();
    });
  } catch (error) {
    view.innerHTML = renderEmpty(error.message);
  } finally {
    setBusy(false);
  }
};

const renderWatch = async (videoId) => {
  setActiveNav("home");
  setBusy(true);
  try {
    const [videoPayload, listPayload] = await Promise.all([
      apiRequest(`/videos/${videoId}`),
      apiRequest("/videos?limit=8&sortBy=createdAt&sortType=desc"),
    ]);
    const video = videoPayload.data;
    const related = (listPayload.data.videos || []).filter(
      (item) => item._id !== video._id
    );
    const isOwner = state.user && video.owner?._id === state.user._id;

    view.innerHTML = `
      <div class="watch-layout">
        <article>
          <video class="player" src="${escapeHtml(video.videoFile)}" poster="${escapeHtml(
            video.thumbnail
          )}" controls autoplay></video>
          <div class="watch-info">
            <h1>${escapeHtml(video.title)}</h1>
            <div class="owner-row">
              <a class="owner-link" href="#/channel/${escapeHtml(video.owner?.username || "")}">
                <img class="avatar" src="${escapeHtml(video.owner?.avatar || "")}" alt="" />
                <span>${escapeHtml(video.owner?.fullName || video.owner?.username || "Channel")}</span>
              </a>
              <span class="muted">${formatCount(video.views)} views • ${formatDate(video.createdAt)}</span>
            </div>
            <div class="description">${escapeHtml(video.description)}</div>
          </div>
          ${
            isOwner
              ? `<div class="surface">
                  <div class="split-row">
                    <strong>Video controls</strong>
                    <div>
                      <button class="ghost-button" id="editVideoButton" type="button">Edit</button>
                      <button class="ghost-button" id="toggleVideoButton" type="button">${
                        video.isPublished ? "Unpublish" : "Publish"
                      }</button>
                      <button class="danger-button" id="deleteVideoButton" type="button">Delete</button>
                    </div>
                  </div>
                </div>`
              : ""
          }
        </article>
        <aside class="surface">
          <h2>More videos</h2>
          <div class="mini-list">${related.length ? related.map(miniVideo).join("") : renderEmpty("No more videos.")}</div>
        </aside>
      </div>
    `;

    if (isOwner) {
      document
        .querySelector("#toggleVideoButton")
        .addEventListener("click", async () => {
          await apiRequest(`/videos/toggle/publish/${video._id}`, {
            method: "PATCH",
          });
          showStatus("Publish status updated.");
          renderWatch(video._id);
        });
      document
        .querySelector("#deleteVideoButton")
        .addEventListener("click", async () => {
          if (!confirm("Delete this video permanently?")) return;
          await apiRequest(`/videos/${video._id}`, { method: "DELETE" });
          showStatus("Video deleted.");
          location.hash = "#/";
        });
      document
        .querySelector("#editVideoButton")
        .addEventListener("click", () => renderEditVideo(video));
    }
  } catch (error) {
    view.innerHTML = renderEmpty(error.message);
  } finally {
    setBusy(false);
  }
};

const renderEditVideo = (video) => {
  view.innerHTML = `
    <div class="section-head">
      <div>
        <h1>Edit video</h1>
        <p>${escapeHtml(video.title)}</p>
      </div>
    </div>
    <form class="surface stack" id="editVideoForm">
      <label>
        <span>Title</span>
        <input name="title" value="${escapeHtml(video.title)}" required />
      </label>
      <label>
        <span>Description</span>
        <textarea name="description" required>${escapeHtml(video.description)}</textarea>
      </label>
      <label>
        <span>Thumbnail</span>
        <input name="thumbnail" type="file" accept="image/*" />
      </label>
      <label>
        <span>Visibility</span>
        <select name="isPublished">
          <option value="true">Published</option>
          <option value="false">Unpublished</option>
        </select>
      </label>
      <button class="primary-button" type="submit">Save changes</button>
    </form>
  `;
  document.querySelector("[name='isPublished']").value = String(
    video.isPublished
  );
  document
    .querySelector("#editVideoForm")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      if (!formData.get("thumbnail")?.size) formData.delete("thumbnail");
      await apiRequest(`/videos/${video._id}`, {
        method: "PATCH",
        body: formData,
      });
      showStatus("Video updated.");
      location.hash = `#/watch/${video._id}`;
    });
};

const renderUpload = () => {
  setActiveNav("upload");
  if (!requireAuth()) return;
  view.innerHTML = `
    <div class="upload-layout">
      <form class="surface stack" id="uploadForm">
        <div class="section-head">
          <div>
            <h1>Upload video</h1>
            <p>Publish a new video to your channel.</p>
          </div>
        </div>
        <label>
          <span>Title</span>
          <input name="title" required />
        </label>
        <label>
          <span>Description</span>
          <textarea name="description" required></textarea>
        </label>
        <label>
          <span>Video file</span>
          <input name="videoFile" type="file" accept="video/*" required />
        </label>
        <label>
          <span>Thumbnail</span>
          <input name="thumbnail" type="file" accept="image/*" required />
        </label>
        <button class="primary-button" type="submit">Publish</button>
      </form>
      <aside class="surface">
        <h2>Channel</h2>
        <div class="owner-link">
          <img class="avatar" src="${escapeHtml(state.user.avatar)}" alt="" />
          <span>${escapeHtml(state.user.fullName)}</span>
        </div>
        <p class="muted">Large files may take a moment while Cloudinary processes the upload.</p>
      </aside>
    </div>
  `;
  document
    .querySelector("#uploadForm")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      setBusy(true);
      try {
        const payload = await apiRequest("/videos", {
          method: "POST",
          body: new FormData(event.currentTarget),
        });
        showStatus("Video published.");
        location.hash = `#/watch/${payload.data._id}`;
      } catch (error) {
        showStatus(error.message, "error");
      } finally {
        setBusy(false);
      }
    });
};

const renderHistory = async () => {
  setActiveNav("history");
  if (!requireAuth()) return;
  setBusy(true);
  try {
    const payload = await apiRequest("/user/history");
    const videos = payload.data || [];
    view.innerHTML = `
      <div class="section-head">
        <div>
          <h1>Watch history</h1>
          <p>${videos.length} videos watched from this account</p>
        </div>
      </div>
      ${videos.length ? `<div class="video-grid">${videos.map(videoCard).join("")}</div>` : renderEmpty("No watch history yet.")}
    `;
  } catch (error) {
    view.innerHTML = renderEmpty(error.message);
  } finally {
    setBusy(false);
  }
};

const renderAccount = () => {
  setActiveNav("account");
  if (!requireAuth()) return;
  view.innerHTML = `
    <div class="account-layout">
      <section class="surface">
        <div class="cover">
          ${state.user.coverImage ? `<img src="${escapeHtml(state.user.coverImage)}" alt="" />` : ""}
        </div>
        <div class="channel-profile">
          <img class="avatar" src="${escapeHtml(state.user.avatar)}" alt="" />
          <div>
            <h1>${escapeHtml(state.user.fullName)}</h1>
            <p class="muted">@${escapeHtml(state.user.username)} • ${escapeHtml(state.user.email)}</p>
          </div>
        </div>
      </section>
      <aside class="stack">
        <form class="surface stack" id="accountForm">
          <h2>Profile</h2>
          <label>
            <span>Full name</span>
            <input name="fullName" value="${escapeHtml(state.user.fullName)}" />
          </label>
          <label>
            <span>Email</span>
            <input name="email" type="email" value="${escapeHtml(state.user.email)}" />
          </label>
          <button class="primary-button" type="submit">Update profile</button>
        </form>
        <form class="surface stack" id="avatarForm">
          <h2>Avatar</h2>
          <input name="avatar" type="file" accept="image/*" required />
          <button class="ghost-button" type="submit">Upload avatar</button>
        </form>
        <form class="surface stack" id="coverForm">
          <h2>Cover image</h2>
          <input name="coverImage" type="file" accept="image/*" required />
          <button class="ghost-button" type="submit">Upload cover</button>
        </form>
        <form class="surface stack" id="passwordForm">
          <h2>Password</h2>
          <input name="oldPassword" type="password" placeholder="Current password" required />
          <input name="newPassword" type="password" placeholder="New password" minlength="6" required />
          <button class="ghost-button" type="submit">Change password</button>
        </form>
      </aside>
    </div>
  `;

  document
    .querySelector("#accountForm")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const payload = await apiRequest("/user/update-account", {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      state.user = payload.data;
      updateAuthUi();
      showStatus("Profile updated.");
      renderAccount();
    });

  document
    .querySelector("#avatarForm")
    .addEventListener("submit", uploadUserFile("/user/avatar"));
  document
    .querySelector("#coverForm")
    .addEventListener("submit", uploadUserFile("/user/cover-image"));
  document
    .querySelector("#passwordForm")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      await apiRequest("/user/change-password", {
        method: "POST",
        body: JSON.stringify(data),
      });
      event.currentTarget.reset();
      showStatus("Password changed.");
    });
};

const uploadUserFile = (path) => async (event) => {
  event.preventDefault();
  const payload = await apiRequest(path, {
    method: "PATCH",
    body: new FormData(event.currentTarget),
  });
  state.user = payload.data;
  updateAuthUi();
  showStatus("Image updated.");
  renderAccount();
};

const renderChannel = async (username) => {
  setActiveNav("home");
  setBusy(true);
  try {
    const payload = await apiRequest(`/user/c/${username}`);
    const channel = payload.data;
    view.innerHTML = `
      <section class="surface">
        <div class="cover">
          ${channel.coverImage ? `<img src="${escapeHtml(channel.coverImage)}" alt="" />` : ""}
        </div>
        <div class="channel-profile">
          <img class="avatar" src="${escapeHtml(channel.avatar)}" alt="" />
          <div>
            <h1>${escapeHtml(channel.fullName)}</h1>
            <p class="muted">@${escapeHtml(channel.username)} • ${channel.publishedVideosCount || 0} videos</p>
          </div>
        </div>
      </section>
      <div class="section-head">
        <div>
          <h2>Latest videos</h2>
          <p>Recently published from this channel.</p>
        </div>
      </div>
      ${
        channel.latestVideos?.length
          ? `<div class="video-grid">${channel.latestVideos
              .map((video) => videoCard({ ...video, owner: channel }))
              .join("")}</div>`
          : renderEmpty("This channel has no public videos yet.")
      }
    `;
  } catch (error) {
    view.innerHTML = renderEmpty(error.message);
  } finally {
    setBusy(false);
  }
};

const route = async () => {
  const [name, value] = location.hash.replace(/^#\/?/, "").split("/");
  if (name === "watch" && value) return renderWatch(value);
  if (name === "upload") return renderUpload();
  if (name === "history") return renderHistory();
  if (name === "account") return renderAccount();
  if (name === "channel" && value) return renderChannel(value);
  return renderHome();
};

const openAuthModal = (tab = "login") => {
  switchAuthTab(tab);
  authModal.showModal();
};

const switchAuthTab = (tab) => {
  const isLogin = tab === "login";
  authTitle.textContent = isLogin ? "Sign in" : "Create account";
  loginForm.classList.toggle("is-hidden", !isLogin);
  registerForm.classList.toggle("is-hidden", isLogin);
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authTab === tab);
  });
};

document.querySelector("#searchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.query = new FormData(event.currentTarget).get("query").trim();
  location.hash = "#/";
  renderHome();
});

document
  .querySelector("#refreshButton")
  .addEventListener("click", () => route());

authButton.addEventListener("click", async () => {
  if (!state.user) {
    openAuthModal("login");
    return;
  }

  try {
    await apiRequest("/user/logout", { method: "POST" });
  } catch {
    // The local session should still end if the server token is already gone.
  }
  clearSession();
  updateAuthUi();
  showStatus("Signed out.");
  route();
});

document.querySelectorAll("[data-auth-tab]").forEach((button) => {
  button.addEventListener("click", () => switchAuthTab(button.dataset.authTab));
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const identifier = form.get("identifier").trim();
  const body = {
    password: form.get("password"),
    ...(identifier.includes("@")
      ? { email: identifier }
      : { username: identifier }),
  };

  try {
    const payload = await apiRequest("/user/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
    saveTokens(payload.data);
    state.user = payload.data.user;
    updateAuthUi();
    authModal.close();
    showStatus("Welcome back.");
    route();
  } catch (error) {
    showStatus(error.message, "error");
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await apiRequest("/user/register", {
      method: "POST",
      body: new FormData(event.currentTarget),
    });
    showStatus("Account created. You can sign in now.");
    event.currentTarget.reset();
    switchAuthTab("login");
  } catch (error) {
    showStatus(error.message, "error");
  }
});

window.addEventListener("hashchange", route);

await loadCurrentUser();
await route();

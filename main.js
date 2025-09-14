const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeeeee);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 15, 0);
camera.lookAt(0, 0, 0);

// ホイールでズームするイベント
window.addEventListener("wheel", (event) => {
    event.preventDefault();

    const zoomSpeed = 0.01;
    camera.position.y += event.deltaY * zoomSpeed;

    // 最小・最大距離の制限
    camera.position.y = Math.min(Math.max(camera.position.y, 3), 50);

    camera.updateProjectionMatrix();

    drawLines();
}, { passive: false });

// 変更パラメータ
let needles = [];
let requestId = null;
let needleLength = 1.0;
let lineSpacing = 1.0;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// 掛線の描画
function drawLines(R) {
    // 既存の線を削除
    for (let i = scene.children.length - 1; i >= 0; i--) {
        const obj = scene.children[i];
        if (obj.userData?.type === "line") scene.remove(obj);
    }
    // カメラ真上から見たときに映るワールド範囲を求める
    const halfFovRad = THREE.MathUtils.degToRad(camera.fov / 2);
    const halfViewHeight = camera.position.y * Math.tan(halfFovRad);
    const halfViewWidth = halfViewHeight * (window.innerWidth / window.innerHeight);

    let range = Math.ceil(Math.max(halfViewHeight, halfViewWidth) * 1.2);

    range = Math.min(range, 100);

    const start = -Math.floor(range / lineSpacing) * lineSpacing;
    for (let x = start; x <= range; x += lineSpacing) {
        const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x, 0.01, -range),
            new THREE.Vector3(x, 0.01, range)
        ]);
        const line = new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({ color: 0x444444 })
        );
        line.userData.type = "line";
        scene.add(line);
    }
}


drawLines(25);

// 物理世界
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);

const floorBody = new CANNON.Body({ mass: 0 });
floorBody.addShape(new CANNON.Plane());
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(floorBody);

const groupNeedle = 1;
const groupFloor = 2;

floorBody.collisionFilterGroup = groupFloor;
floorBody.collisionFilterMask = groupNeedle;

// 針の生成
function createNeedle(L, R) {
    const body = new CANNON.Body({ mass: 0.1 });
    body.allowSleep = false;
    body.collisionFilterGroup = groupNeedle;
    body.collisionFilterMask = groupFloor;
    body.linearDamping = 0.1;
    body.angularDamping = 0.2;
    const radius = 0.02;
    const halfLen = L / 2;

    // 両端に球＋中央にシリンダーでカプセル状にする
    const cyl = new CANNON.Cylinder(radius, radius, L, 8);
    body.addShape(cyl);

    const sphere1 = new CANNON.Sphere(radius);
    const sphere2 = new CANNON.Sphere(radius);
    body.addShape(sphere1, new CANNON.Vec3(0, halfLen, 0));
    body.addShape(sphere2, new CANNON.Vec3(0, -halfLen, 0));

    // 設置場所、設置角度、初速
    body.position.set(
        (Math.random() - 0.5) * 2 * R,
        5 + Math.random() * 2,
        (Math.random() - 0.5) * 2 * R
    );
    body.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    body.velocity.set(Math.random() * 2 - 1, 0, Math.random() * 2 - 1);
    world.addBody(body);

    const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, L, 8),
        new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    scene.add(mesh);
    return { body, mesh, stopped: false };
}


function resetSimulation() {
    resultShown = false;

    // 古い針を削除
    for (const n of needles) {
        world.removeBody(n.body);
        scene.remove(n.mesh);
    }
    needles.length = 0;

    // 古い掛け線を削除
    for (let i = scene.children.length - 1; i >= 0; i--) {
        const obj = scene.children[i];
        if (obj.userData?.type === "line") {
            scene.remove(obj);
        };
    }

    // 前回結果をクリア
    document.getElementById("result").textContent = "";

    // 入力値を取得
    const L = parseFloat(document.getElementById("lenInput").value);
    const d = parseFloat(document.getElementById("spaceInput").value);
    const N = parseInt(document.getElementById('numInput').value);
    let R = parseInt(document.getElementById('spreadInput').value);

    // 入力バリデーション
    if (L > d) {
        alert("針の長さ L は線間隔 d 以下にしてください。");
        return;
    }
    if (!Number.isFinite(R) || R <= 0) {
        R = 5;
    }


    needleLength = L;
    lineSpacing = d;

    const aspect = window.innerWidth / window.innerHeight;
    const halfFovRad = THREE.MathUtils.degToRad(camera.fov / 2);
    const targetHalfWidth = R * 1.1;
    const targetHalfHeight = targetHalfWidth / aspect;
    const halfVisible = Math.max(targetHalfWidth, targetHalfHeight);

    let camY = halfVisible / Math.tan(halfFovRad);
    camY = Math.min(Math.max(camY, 5), 50);

    camera.position.set(0, camY, 0);
    camera.lookAt(0, 0, 0);

    // 線を再生成
    drawLines(R);

    // 針を生成
    for (let i = 0; i < N; i++) {
        needles.push(createNeedle(needleLength, R));
    }

    // アニメーションをリスタート
    if (!requestId) {
        animate();
    }
}

const startButton = document.getElementById('startBtn');
startButton.addEventListener('click', resetSimulation);
window.addEventListener('keydown', () => {
    if (event.key === "Enter") {
        resetSimulation();
    }
});

function showPI() {
    const hits = needles.filter((n) => n.mesh.material.color.getHex() === 0xff0000).length;
    const N = needles.length;
    const resultBox = document.getElementById("result");

    if (hits > 0) {
        const piEstimate = (2 * needleLength * N) / (lineSpacing * hits);
        const relError = Math.abs(piEstimate - Math.PI) / Math.PI * 100;

        resultBox.textContent =
            `推定π ≒ ${piEstimate.toFixed(5)}\n` +
            `相対誤差 ≒ ${relError.toFixed(2)}%\n` +
            `(交差 ${hits} / 本数 ${N}）`;
    } else {
        resultBox.textContent = "交差した針が 0 本だったため π を推定できません";
    }
}


let resultShown = false;

// アニメーションループ
function animate() {
    requestId = requestAnimationFrame(animate);

    world.step(1 / 60);

    let allStopped = true;

    for (const n of needles) {
        n.mesh.position.copy(n.body.position);
        n.mesh.quaternion.copy(n.body.quaternion);

        if (n.stopped) {
            continue;
        }

        allStopped = false;

        const speed = n.body.velocity.length();
        if (speed < 0.1) {
            n.stopped = true;

            // 交差判定
            // 針の両端のワールド座標を取得
            // animate() 内の交差判定部分
            const halfLen = needleLength / 2;
            const localDir = new THREE.Vector3(0, halfLen, 0);
            const worldDir = localDir.clone().applyQuaternion(n.mesh.quaternion);

            const p1 = n.mesh.position.clone().add(worldDir);
            const p2 = n.mesh.position.clone().add(worldDir.clone().negate());

            const idx1 = Math.floor(p1.x / lineSpacing);
            const idx2 = Math.floor(p2.x / lineSpacing);

            if (idx1 !== idx2) {
                n.mesh.material.color.set(0xff0000); // 交差→赤
            }
        }
    }

    if (needles.length > 0 && allStopped && !resultShown) {
        cancelAnimationFrame(requestId);
        requestId = null;
        showPI();
        resultShown = true;
        return;
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    drawLines();
    renderer.render(scene, camera);
})
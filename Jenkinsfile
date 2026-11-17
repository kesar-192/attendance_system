// CampusFlow CI/CD:  Install -> Lint -> Test -> Build -> Deploy
//
// Jenkins prerequisites
//   * Plugins: Pipeline, NodeJS, Credentials Binding, JUnit
//   * Global Tool Configuration: a NodeJS installation named "NodeJS-20" (Node 20 LTS)
//   * Agent with Docker Engine + Docker Compose v2 (the agent user must be in the "docker" group)
//   * Credentials: a "Secret file" with id "campusflow-env-file" containing the production .env
//     (copy .env.example and fill it in). It is only read by the Deploy stage on the main branch.
pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    timeout(time: 45, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  tools {
    nodejs 'NodeJS-20'
  }

  environment {
    CI = 'true'
    IMAGE_TAG = "${env.BUILD_NUMBER}"
    COMPOSE_PROJECT_NAME = 'campusflow'
    NPM_CONFIG_CACHE = "${env.WORKSPACE}/.npm-cache"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      parallel {
        stage('Backend dependencies') {
          steps {
            dir('backend') {
              sh 'npm ci --no-audit --no-fund'
            }
          }
        }
        stage('Frontend dependencies') {
          steps {
            dir('frontend') {
              sh 'npm ci --no-audit --no-fund'
            }
          }
        }
      }
    }

    stage('Lint') {
      parallel {
        stage('Backend lint') {
          steps {
            dir('backend') {
              sh 'npm run lint'
            }
          }
        }
        stage('Frontend lint') {
          steps {
            dir('frontend') {
              sh 'npm run lint'
            }
          }
        }
        stage('Dependency audit') {
          steps {
            // advisories mark the build UNSTABLE instead of failing it
            catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
              sh '''
                (cd backend && npm audit --omit=dev --audit-level=high)
                (cd frontend && npm audit --omit=dev --audit-level=high)
              '''
            }
          }
        }
      }
    }

    stage('Test') {
      steps {
        dir('backend') {
          // starts a throw-away mongo:7 container, runs Jest + Supertest with coverage, always cleans up
          sh './scripts/ci-test.sh'
        }
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'backend/reports/junit.xml'
          archiveArtifacts artifacts: 'backend/coverage/lcov.info', allowEmptyArchive: true
        }
      }
    }

    stage('Build') {
      steps {
        sh '''
          set -eu
          docker build --pull -t campusflow-backend:${IMAGE_TAG} -t campusflow-backend:latest backend
          docker build --pull -t campusflow-frontend:${IMAGE_TAG} -t campusflow-frontend:latest --build-arg VITE_API_URL=/api frontend
        '''
      }
    }

    stage('Deploy') {
      when {
        anyOf {
          branch 'main'
          expression { env.GIT_BRANCH == 'origin/main' || env.GIT_BRANCH == 'main' }
        }
      }
      steps {
        withCredentials([file(credentialsId: 'campusflow-env-file', variable: 'ENV_FILE')]) {
          sh '''
            set -eu
            cp "$ENV_FILE" .env
            chmod 600 .env

            wait_healthy() {
              for service in backend frontend; do
                ok=0
                for _ in $(seq 1 40); do
                  cid="$(docker compose ps -q "$service" || true)"
                  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo starting)"
                  if [ "$status" = "healthy" ]; then ok=1; break; fi
                  sleep 3
                done
                [ "$ok" = 1 ] || return 1
              done
              return 0
            }

            # remember what is running so a failed release can be rolled back
            PREV_TAG="$(docker compose ps -q backend 2>/dev/null | head -n1 | xargs -r docker inspect --format '{{.Config.Image}}' 2>/dev/null | sed 's/.*://' || true)"

            docker compose up -d --remove-orphans --no-build

            if ! wait_healthy; then
              echo "Deployment of build ${IMAGE_TAG} is unhealthy" >&2
              docker compose logs --tail=80 backend frontend || true
              if [ -n "${PREV_TAG:-}" ] && [ "$PREV_TAG" != "$IMAGE_TAG" ]; then
                echo "Rolling back to image tag ${PREV_TAG}" >&2
                IMAGE_TAG="$PREV_TAG" docker compose up -d --no-build
              fi
              exit 1
            fi

            # smoke test through the public entry point: the SPA is served and /api is proxied
            WEB_PORT="$(grep -E '^WEB_PORT=' .env | cut -d= -f2 || true)"
            WEB_PORT="${WEB_PORT:-80}"
            curl -fsS "http://127.0.0.1:${WEB_PORT}/healthz" >/dev/null
            code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${WEB_PORT}/api/auth/me")"
            [ "$code" = "401" ] || { echo "Unexpected API status through proxy: $code" >&2; exit 1; }

            docker image prune -f --filter "until=168h" || true
          '''
        }
      }
      post {
        cleanup {
          sh 'rm -f .env || true'
        }
      }
    }
  }

  post {
    success {
      echo "CampusFlow build ${env.BUILD_NUMBER} finished successfully"
    }
    failure {
      echo "CampusFlow build ${env.BUILD_NUMBER} failed - see the stage logs above"
    }
    cleanup {
      sh 'docker image prune -f >/dev/null 2>&1 || true'
    }
  }
}

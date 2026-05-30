#!/usr/bin/env python3
"""One-time Vertex AI Search setup for Buddy Live drill knowledge corpus.

Creates the data store (if missing), uploads knowledge/*.md to GCS, imports
documents, and prints the env var for Cloud Run.

Usage (from repo root, with gcloud auth and puck-buddy access):

    python3 infra/scripts/setup_vertex_search.py
    python3 infra/scripts/setup_vertex_search.py --skip-upload   # data store + import only
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

from google.api_core.client_options import ClientOptions
from google.api_core import exceptions as gcp_exceptions
from google.cloud import discoveryengine_v1 as discoveryengine
from google.cloud import storage
from google.longrunning import operations_pb2
from google.protobuf import json_format

PROJECT = "puck-buddy"
LOCATION = "global"
COLLECTION = "default_collection"
DATA_STORE_ID = "buddy-live-drills"
BUCKET = "puck-buddy-drill-knowledge"
REPO_ROOT = Path(__file__).resolve().parents[2]
KNOWLEDGE_DIR = REPO_ROOT / "services" / "buddy-live-adk" / "knowledge"
DATA_STORE_PATH = (
    f"projects/{PROJECT}/locations/{LOCATION}/collections/{COLLECTION}"
    f"/dataStores/{DATA_STORE_ID}"
)


def _client_options() -> ClientOptions:
    return ClientOptions(
        api_endpoint="discoveryengine.googleapis.com",
        quota_project_id=PROJECT,
    )


def _data_store_client() -> discoveryengine.DataStoreServiceClient:
    return discoveryengine.DataStoreServiceClient(client_options=_client_options())


def _document_client() -> discoveryengine.DocumentServiceClient:
    return discoveryengine.DocumentServiceClient(client_options=_client_options())


def ensure_data_store() -> None:
    client = _data_store_client()
    name = f"{DATA_STORE_PATH}"
    try:
        ds = client.get_data_store(name=name)
        print(f"data store exists: {ds.display_name} ({ds.name})")
        return
    except gcp_exceptions.NotFound:
        pass

    parent = client.collection_path(
        project=PROJECT, location=LOCATION, collection=COLLECTION
    )
    data_store = discoveryengine.DataStore(
        display_name="Buddy Live Drills",
        industry_vertical=discoveryengine.IndustryVertical.GENERIC,
        solution_types=[discoveryengine.SolutionType.SOLUTION_TYPE_SEARCH],
        content_config=discoveryengine.DataStore.ContentConfig.CONTENT_REQUIRED,
    )
    print(f"creating data store {DATA_STORE_ID}...")
    op = client.create_data_store(
        parent=parent,
        data_store_id=DATA_STORE_ID,
        data_store=data_store,
    )
    op.result(timeout=600)
    print(f"created {name}")


def ensure_bucket() -> None:
    storage_client = storage.Client(project=PROJECT)
    bucket = storage_client.bucket(BUCKET)
    if not bucket.exists():
        print(f"creating bucket gs://{BUCKET}...")
        bucket.create(location="US")
    else:
        print(f"bucket gs://{BUCKET} exists")


def build_and_upload_jsonl() -> None:
    """Build Discovery Engine JSONL manifest and upload corpus + manifest to GCS."""
    ensure_bucket()
    storage_client = storage.Client(project=PROJECT)
    bucket = storage_client.bucket(BUCKET)
    md_files = sorted(KNOWLEDGE_DIR.glob("*.md"))
    if not md_files:
        raise SystemExit(f"no markdown files in {KNOWLEDGE_DIR}")

    entries: list[dict] = []
    for path in md_files:
        if path.name == "README.md":
            continue
        blob = bucket.blob(path.name)
        print(f"uploading {path.name}...")
        blob.upload_from_filename(str(path), content_type="text/plain")
        doc_id = path.stem.replace("_", "-")
        entries.append(
            {
                "id": doc_id,
                "structData": {"title": path.stem.replace("-", " ").title()},
                "content": {
                    "mimeType": "text/plain",
                    "uri": f"gs://{BUCKET}/{path.name}",
                },
            }
        )

    import json

    jsonl = "\n".join(json.dumps(entry) for entry in entries)
    bucket.blob("import.jsonl").upload_from_string(
        jsonl, content_type="application/jsonl"
    )
    print(f"uploaded {len(entries)} docs + import.jsonl to gs://{BUCKET}/")


def import_documents() -> None:
    client = _document_client()
    parent = f"{DATA_STORE_PATH}/branches/default_branch"
    request = discoveryengine.ImportDocumentsRequest(
        parent=parent,
        gcs_source=discoveryengine.GcsSource(
            input_uris=[f"gs://{BUCKET}/import.jsonl"],
            data_schema="document",
        ),
        reconciliation_mode=discoveryengine.ImportDocumentsRequest.ReconciliationMode.FULL,
    )
    print("importing documents via JSONL (may take a few minutes)...")
    op = client.import_documents(request=request)
    op.result(timeout=900)
    listed = list(client.list_documents(parent=parent))
    print(f"import complete — {len(listed)} documents indexed")


def grant_viewer_role() -> None:
    sa = f"buddy-live-adk@{PROJECT}.iam.gserviceaccount.com"
    cmd = [
        "gcloud",
        "projects",
        "add-iam-policy-binding",
        PROJECT,
        f"--member=serviceAccount:{sa}",
        "--role=roles/discoveryengine.viewer",
        "--condition=None",
    ]
    print("granting discoveryengine.viewer to runtime SA...")
    subprocess.run(cmd, check=True)


def update_cloud_run_env() -> None:
    cmd = [
        "gcloud",
        "run",
        "services",
        "update",
        "buddy-live-adk",
        f"--region=us-central1",
        f"--project={PROJECT}",
        f"--update-env-vars=BUDDY_VERTEX_SEARCH_DATA_STORE_ID={DATA_STORE_PATH}",
    ]
    print("setting BUDDY_VERTEX_SEARCH_DATA_STORE_ID on Cloud Run...")
    subprocess.run(cmd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-upload", action="store_true")
    parser.add_argument("--skip-cloud-run", action="store_true")
    args = parser.parse_args()

    ensure_data_store()
    if not args.skip_upload:
        build_and_upload_jsonl()
    import_documents()
    grant_viewer_role()
    if not args.skip_cloud_run:
        update_cloud_run_env()

    print("\nDone.")
    print(f"BUDDY_VERTEX_SEARCH_DATA_STORE_ID={DATA_STORE_PATH}")
    print("Verify: live session → lookup_drill_knowledge → available=true in Cloud Trace")


if __name__ == "__main__":
    main()

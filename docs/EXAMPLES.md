# Worked Examples and Test Fixtures

This document explains what the platform should do through concrete sample workflows. All names, IDs, labels and metadata below are illustrative. Any sample image used by tests must be generated locally or be clearly licensed for redistribution.

## 1. Example A — Product damage classification

### User goal

A student is building a computer-vision prototype that classifies product photographs into two categories: normal and damaged. The user has a folder of product images and wants a training-ready dataset.

### Step 1: Create the project and dataset

Project: Product Inspection Demo  
Dataset: Product Condition Images  
Task: image_classification  
Labels:
- normal
- damaged

Annotation guidance:
- Use damaged only when visible physical damage is present.
- If the image is too blurry or the product is obscured, do not guess; mark it for correction/review.
- A model suggestion is not a verified label.
- Record the evidence/reason for ambiguous cases where practical.

The platform creates a project ID and dataset ID, a schema version, and an annotation guideline revision.

### Step 2: Import images

The user selects a folder containing:
- normal_001.jpg
- normal_002.jpg
- damaged_001.jpg
- damaged_002.jpg
- damaged_002_copy.jpg
- broken_file.jpg

The importer checks each file's bytes and actual media type, applies configured limits, computes SHA-256 and generates opaque asset IDs. It does not trust the original filename as a storage path.

Illustrative import result:
- 4 unique readable images accepted.
- 1 exact duplicate detected and reported.
- 1 unreadable file rejected with a specific diagnostic.
- No accepted record is silently deleted because it is a duplicate; duplicate handling is visible and policy-driven.

The import report records counts, item-level results, hashes and a ProcessingRun ID. This example assumes the duplicate really has identical bytes; visual similarity alone is not an exact duplicate.

### Step 3: Generate model proposals

The user configures an image-capable model and explicitly starts annotation. The platform checks that the provider is configured, the model supports image input and the task output schema is valid.

Example normalized proposal:

    {
      "id": "ann_demo_0001",
      "record_id": "rec_demo_0001",
      "task": "image_classification",
      "schema_version": 1,
      "data": {
        "label": "damaged"
      },
      "origin": "model",
      "status": "pending_review",
      "processing_run_id": "run_demo_0001",
      "model": {
        "provider": "example-provider",
        "model_id": "example-vision-model",
        "prompt_template_version": "damage-classification-v1"
      }
    }

All provider/model names in this example are placeholders, not claims of actual support. The original raw response may be retained as a restricted/redacted run artifact according to privacy settings. It is not automatically treated as ground truth.

### Step 4: Review and correct

The review queue shows the image, proposed label, model/source information, review status and available actions.

If the proposal is wrong, the user changes damaged to normal and provides an optional reason. The system:
1. Preserves the model's original annotation revision.
2. Creates a new human-origin revision.
3. Records a review event.
4. Updates the current annotation pointer transactionally.
5. Marks the final annotation approved only after the user's explicit action.

The quality dashboard counts model proposals, approved labels, rejected labels and pending review separately.

### Step 5: Validate

The validator checks:
- Required label exists.
- Label belongs to the allowed label set.
- Primary image asset exists and can be read.
- Record ID and asset references are valid.
- Exact duplicate policy is applied consistently.
- Review status is included in report metrics.
- Provenance exists for model-origin annotations.

A report may say:
- 4 unique records checked.
- 3 approved.
- 1 pending review.
- 0 schema errors.
- 1 duplicate warning.
- 1 import rejection.

The counts are illustrative. A real report derives all numbers from the actual dataset version and records.

### Step 6: Publish a version

The user resolves publish-blocking errors and explicitly publishes version 1. The version manifest records the exact record IDs, annotation revision IDs, schema version, source references and validation report reference.

Later correction of a label does not mutate version 1. It creates a new annotation revision; publishing again creates version 2 with a link to its parent version.

### Step 7: Export

An image-classification export may contain:
- A documented folder or manifest of images.
- A JSONL/CSV record file with stable record ID and label.
- Dataset card/README.
- Schema/data dictionary.
- Source/provenance manifest.
- Quality report.
- Export manifest with version ID, counts, exporter version and checksums where feasible.

The exact folder structure should be defined by the selected exporter. Do not assume a generic JSONL export is interchangeable with every training framework's image loader.

## 2. Example B — Text classification

### User goal

A student wants to classify product reviews as positive, neutral or negative.

Schema:
- Field: text, required string.
- Field: label, required enum: positive, neutral, negative.
- Optional field: language.
- Optional field: source reference.

Example input record:

    {
      "external_id": "review-1001",
      "text": "The product arrived quickly and works well.",
      "metadata": {
        "language": "en"
      }
    }

Model proposal:

    {
      "task": "text_classification",
      "data": {
        "label": "positive"
      },
      "origin": "model",
      "status": "pending_review"
    }

If the model returns "happy" instead of one of the allowed labels, the normalizer must not silently map it to positive unless an explicit, tested mapping rule exists. Otherwise mark the result invalid and show the validation error.

If a record is empty or only whitespace, validation should flag it. If a record contains personal information, any detection/redaction feature must be disclosed and its transformations must be traceable; do not silently rewrite the original source.

The final export should retain stable IDs and the approved label. It should document the label definitions and any known class imbalance.

## 3. Example C — Object detection

### User goal

A user wants to label damaged areas in product photographs with bounding boxes and export YOLO format.

Internal coordinate convention:
- x and y are the top-left coordinate in original-image pixel space.
- width and height are positive pixel dimensions.
- coordinates are validated against original image width and height.
- class identity is a stable schema class ID, not a UI list index.

Example internal annotation:

    {
      "task": "object_detection",
      "data": {
        "objects": [
          {
            "class_id": "damage",
            "bbox": {
              "x": 100,
              "y": 80,
              "width": 120,
              "height": 90
            }
          }
        ]
      },
      "origin": "human",
      "status": "approved"
    }

For a 640 by 480 image, the example box ends at x=220 and y=170, which is inside the image. If x or y is negative, width/height is zero or negative, or the box exceeds image bounds, validation rejects or flags it according to the task policy.

A YOLO exporter converts the pixel box into normalized center coordinates and width/height:
- center_x = (x + width / 2) / image_width
- center_y = (y + height / 2) / image_height
- normalized_width = width / image_width
- normalized_height = height / image_height

Using the example:
- center_x = 160 / 640 = 0.25
- center_y = 125 / 480 ≈ 0.2604167
- normalized_width = 120 / 640 = 0.1875
- normalized_height = 90 / 480 = 0.1875

The exporter must map the stable schema class ID to the numeric class index in a generated class-order file. That mapping must be included in the export manifest so labels can be interpreted later. Use a deterministic, documented class ordering.

A COCO exporter uses its own image, category and annotation identifiers and bounding-box convention. Do not simply rename a YOLO file to JSON; convert and validate the structures.

## 4. Example D — Multimodal linked sample (future capability)

A single product-inspection sample might contain:
- Original photograph.
- Crop of the damaged region.
- Human-approved bounding box.
- Caption describing visible damage.
- OCR text from the product label.
- Optional audio inspection note.
- Structured condition report.

These are not independent unrelated records if they describe the same inspection event. A stable record ID links them; each asset has its own ID and modality; each annotation has its own task and schema. Cross-modal consistency checks can flag a caption that claims "no damage" when the approved label says "damaged", but this is a review signal rather than automatic proof that one field is correct.

## 5. Example E — Provenance chain

For a model-generated caption, the lineage should be inspectable:

    source asset
      -> preprocessing run (resize/crop, if any)
      -> model annotation run
      -> normalized caption proposal
      -> human edit/review revision
      -> published dataset version
      -> export artifact

The lineage record should answer:
- Which asset bytes were used?
- Which transformation and parameters were applied?
- Which provider/model and prompt-template version produced the proposal?
- What raw/normalized output is available under retention policy?
- Who approved or changed the annotation, and when?
- Which dataset version included the approved revision?
- Which export artifact was produced from that version?

If any detail is unknown, represent it as unknown rather than fabricating a value.

## 6. Example F — Source rights review

A research agent finds a web page that displays an image. The platform stores the page URL, retrieval time and source metadata. Unless the page provides clear, relevant rights evidence, the rights status is unknown or review-required.

A source state is not just "public/private". Use explicit concepts such as:
- unknown
- review_required
- approved_for_intended_use
- restricted
- rejected

The state should include scope and evidence. Approval for internal research does not necessarily imply permission to redistribute the image or include it in a public dataset. Export policy must consider intended use and attribution requirements.

## 7. Synthetic fixtures recommended for tests

Keep a tiny test fixture generated from shapes/text in the test suite or created under a permissive license:
- 2 valid image classification records with different labels.
- 1 invalid record with an unknown label.
- 1 image with a deliberately duplicated byte hash.
- 1 invalid/unreadable media fixture.
- 3 text records across at least two labels.
- 1 empty/whitespace-only text record.
- 1 object detection image with a known box.
- 1 invalid box with negative coordinates.
- 1 provider response matching schema.
- 1 malformed provider response.
- 1 record with unknown source rights.

Tests should assert the expected outcome and error category, not rely on arbitrary UI text or unstable generated IDs.

## 8. End-to-end acceptance scenario

A clean-install smoke test should:
1. Start the app with documented local configuration.
2. Create a project and image-classification dataset.
3. Import a small synthetic fixture.
4. Manually label one record.
5. Run the fake provider on another record.
6. Verify the model output is pending review.
7. Correct/approve the annotation.
8. Run validation and inspect the report.
9. Publish an immutable version.
10. Export JSONL and CSV.
11. Reload the exported records and compare IDs/labels.
12. Verify the version manifest and documentation identify the exact version.
13. Restart the application and confirm persisted state remains available.

This test must not require internet access, paid credentials or a real model API. Real-provider smoke tests may be optional and must be separately configured.

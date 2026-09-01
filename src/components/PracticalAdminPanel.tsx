import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Spinner } from "@/components/Spinner";

type PracticalItem = {
  id: string;
  category_id: string;
  structure_type: string;
  image_url: string;
  correct_answer: string;
  explanation: string | null;
  is_published: boolean;
  created_at: string;
};

type Category = {
  id: string;
  topic_id: string;
  name: string;
  display_order: number;
};

type Topic = {
  id: string;
  name: string;
  subject: string;
  display_order: number;
};

export function PracticalAdminPanel() {
  const qc = useQueryClient();
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editingItem, setEditingItem] = useState<PracticalItem | null>(null);

  // Fetch topics
  const topicsQ = useQuery({
    queryKey: ["admin", "topics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return data as Topic[];
    },
  });

  // Fetch categories for selected topic
  const categoriesQ = useQuery({
    enabled: !!selectedTopic,
    queryKey: ["admin", "categories", selectedTopic],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("topic_id", selectedTopic)
        .order("display_order");
      if (error) throw error;
      return data as Category[];
    },
  });

  // Fetch practical items for selected category
  const itemsQ = useQuery({
    enabled: !!selectedCategory,
    queryKey: ["admin", "practical-items", selectedCategory],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practical_items")
        .select("*")
        .eq("category_id", selectedCategory)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PracticalItem[];
    },
  });

  // Delete item mutation
  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      if (!confirm("Delete this practical item?")) throw new Error("cancelled");
      const { error } = await supabase
        .from("practical_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item deleted");
      qc.invalidateQueries({ queryKey: ["admin", "practical-items", selectedCategory] });
    },
    onError: (err: Error) => {
      if (err.message !== "cancelled") toast.error(err.message);
    },
  });

  // Toggle publish mutation
  const togglePublish = useMutation({
    mutationFn: async (item: PracticalItem) => {
      const { error } = await supabase
        .from("practical_items")
        .update({ is_published: !item.is_published })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["admin", "practical-items", selectedCategory] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      {/* Topic and Category Selection */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Practical Mode Management</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Select Topic</label>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={selectedTopic}
              onChange={(e) => {
                setSelectedTopic(e.target.value);
                setSelectedCategory("");
              }}
            >
              <option value="">Select a topic...</option>
              {topicsQ.data?.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Select Category</label>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              disabled={!selectedTopic}
            >
              <option value="">Select a category...</option>
              {categoriesQ.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {selectedCategory && (
        <>
          {/* Settings Panel */}
          <PracticalSettingsPanel categoryId={selectedCategory} />

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h3 className="text-lg font-semibold">
              Practical Items ({itemsQ.data?.length || 0})
            </h3>
            <div className="flex gap-2">
              <button
                className="btn-outline px-4 py-2"
                onClick={() => {
                  setShowBulkImport(true);
                  setShowAddForm(false);
                }}
              >
                📦 Bulk Import CSV
              </button>
              <button
                className="btn-primary px-4 py-2"
                onClick={() => {
                  setEditingItem(null);
                  setShowAddForm(true);
                  setShowBulkImport(false);
                }}
              >
                + Add Single Label
              </button>
            </div>
          </div>

          {/* Bulk Import Panel */}
          {showBulkImport && (
            <PracticalBulkImport
              categoryId={selectedCategory}
              onClose={() => setShowBulkImport(false)}
              onDone={() => {
                setShowBulkImport(false);
                qc.invalidateQueries({
                  queryKey: ["admin", "practical-items", selectedCategory],
                });
              }}
            />
          )}

          {/* Items List */}
          {itemsQ.isLoading ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : itemsQ.data?.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
              No practical items added yet. Click "Add Single Label" or "Bulk Import CSV" to add items.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {itemsQ.data?.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex gap-4">
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.correct_answer}
                        className="w-32 h-32 object-cover rounded-lg bg-muted"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{item.correct_answer}</h4>
                          <p className="text-sm text-muted-foreground">
                            Type: {item.structure_type}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            className={`px-2 py-1 text-xs rounded-full ${
                              item.is_published
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                            onClick={() => togglePublish.mutate(item)}
                          >
                            {item.is_published ? "Published" : "Draft"}
                          </button>
                          <button
                            className="text-xs text-primary hover:underline"
                            onClick={() => {
                              setEditingItem(item);
                              setShowAddForm(true);
                              setShowBulkImport(false);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="text-xs text-rose-500 hover:underline"
                            onClick={() => deleteItem.mutate(item.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      {item.explanation && (
                        <p className="text-sm text-muted-foreground">
                          {item.explanation}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit Form Modal */}
          {showAddForm && (
            <PracticalItemForm
              categoryId={selectedCategory}
              item={editingItem}
              onClose={() => {
                setShowAddForm(false);
                setEditingItem(null);
              }}
              onSaved={() => {
                setShowAddForm(false);
                setEditingItem(null);
                qc.invalidateQueries({
                  queryKey: ["admin", "practical-items", selectedCategory],
                });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

// Practical Settings Panel Component
function PracticalSettingsPanel({ categoryId }: { categoryId: string }) {
  const [labelsPerQuestion, setLabelsPerQuestion] = useState(5);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!categoryId) return;

    const fetchSettings = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("practical_settings")
        .select("labels_per_question")
        .eq("category_id", categoryId)
        .single();

      if (!error && data) {
        setLabelsPerQuestion(data.labels_per_question);
      }
      setLoading(false);
    };

    fetchSettings();
  }, [categoryId]);

  const saveSettings = async () => {
    if (!categoryId) return;

    setSaving(true);
    const { error } = await supabase.rpc("update_practical_settings", {
      p_category_id: categoryId,
      p_labels_per_question: labelsPerQuestion,
    });

    if (error) {
      toast.error("Failed to save settings");
      console.error("Error saving settings:", error);
    } else {
      toast.success("Settings saved successfully");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-sm text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h3 className="text-lg font-semibold mb-4">Practical Mode Settings</h3>

      <div className="space-y-2">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="labels-per-question"
        >
          Labels per question (3-8)
        </label>
        <input
          id="labels-per-question"
          type="number"
          min={3}
          max={8}
          value={labelsPerQuestion}
          onChange={(e) => {
            const value = parseInt(e.target.value) || 5;
            setLabelsPerQuestion(Math.min(8, Math.max(3, value)));
          }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2"
        />
        <p className="text-xs text-muted-foreground">
          Students will see this many labels to identify in each practical question.
        </p>
      </div>

      <button
        className="btn-primary w-full mt-4"
        onClick={saveSettings}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

// Bulk Import Component
function PracticalBulkImport({
  categoryId,
  onClose,
  onDone,
}: {
  categoryId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentCell += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          currentCell += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          currentRow.push(currentCell.trim());
          currentCell = "";
        } else if (char === "\r") {
          // Ignore carriage return
        } else if (char === "\n") {
          currentRow.push(currentCell.trim());
          if (currentRow.some((cell) => cell.length > 0)) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentCell = "";
        } else {
          currentCell += char;
        }
      }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
    }

    return rows;
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      
      if (rows.length < 2) {
        throw new Error("CSV must contain a header row and at least one data row.");
      }

      const itemsToInsert: Array<{
        category_id: string;
        structure_type: string;
        image_url: string;
        correct_answer: string;
        explanation: string | null;
        is_published: boolean;
      }> = [];

      const skippedRows: Array<{ row: number; reason: string }> = [];

      // Skip header row (index 0)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        
        // Expected columns: structure_type, image_url, correct_answer, explanation (optional)
        if (row.length < 3) {
          skippedRows.push({
            row: i + 1,
            reason: `Row has insufficient columns (found ${row.length}, expected at least 3)`,
          });
          continue;
        }

        const [structureType, imageUrl, correctAnswer, explanation] = row;

        // Validate required fields
        if (!structureType || !imageUrl || !correctAnswer) {
          skippedRows.push({
            row: i + 1,
            reason: `Missing required fields (Structure Type: "${structureType || 'empty'}", Image URL: "${imageUrl || 'empty'}", Correct Answer: "${correctAnswer || 'empty'}")`,
          });
          continue;
        }

        itemsToInsert.push({
          category_id: categoryId,
          structure_type: structureType,
          image_url: imageUrl,
          correct_answer: correctAnswer,
          explanation: explanation || null,
          is_published: true,
        });
      }

      if (itemsToInsert.length === 0) {
        const skipSummary = skippedRows.length > 0
          ? `\n\nSkipped rows:\n${skippedRows.map((s) => `Row ${s.row}: ${s.reason}`).join("\n")}`
          : "";
        throw new Error(`No valid items found to import.${skipSummary}`);
      }

      // Insert all valid items
      const { error: insertErr } = await supabase
        .from("practical_items")
        .insert(itemsToInsert);
      
      if (insertErr) throw insertErr;

      // Report success
      if (skippedRows.length > 0) {
        const skipSummary = skippedRows
          .map((s) => `Row ${s.row}: ${s.reason}`)
          .join("\n");
        toast.warning(
          `Imported ${itemsToInsert.length} items successfully.\n\nSkipped ${skippedRows.length} row(s):\n${skipSummary}`,
          { duration: 8000 }
        );
      } else {
        toast.success(`Successfully imported ${itemsToInsert.length} practical items.`);
      }

      onDone();
    } catch (err) {
      const error = err as Error;
      toast.error(error.message || "Failed to parse CSV");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Bulk Import Practical Items</h3>
        <button
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          ✕ Close
        </button>
      </div>

      <div className="space-y-4">
        <div className="bg-muted/50 rounded-lg p-4">
          <h4 className="text-sm font-medium mb-2">CSV Format Instructions:</h4>
          <p className="text-xs text-muted-foreground mb-2">
            Your CSV file should have the following columns:
          </p>
          <pre className="text-xs bg-background rounded p-2 overflow-x-auto">
            structure_type,image_url,correct_answer,explanation
          </pre>
          <p className="text-xs text-muted-foreground mt-2">
            Example:
          </p>
          <pre className="text-xs bg-background rounded p-2 overflow-x-auto mt-1">
            Bone,https://example.com/femur.jpg,Femur,The longest bone in the body{"\n"}
            Muscle,https://example.com/biceps.jpg,Biceps Brachii,Located in the upper arm
          </pre>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>Note:</strong> The explanation column is optional. Use double quotes for values containing commas.
          </p>
        </div>

        <input
          type="file"
          accept=".csv"
          ref={fileRef}
          onChange={handleImport}
          className="hidden"
          id="practical-csv-upload"
          disabled={importing}
        />
        <label
          htmlFor="practical-csv-upload"
          className={`cursor-pointer inline-block rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            importing
              ? "bg-muted text-muted-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          {importing ? "Importing..." : "Choose CSV File"}
        </label>
      </div>
    </div>
  );
}

// Practical Item Form Component
function PracticalItemForm({
  categoryId,
  item,
  onClose,
  onSaved,
}: {
  categoryId: string;
  item: PracticalItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [structureType, setStructureType] = useState(item?.structure_type || "");
  const [imageUrl, setImageUrl] = useState(item?.image_url || "");
  const [correctAnswer, setCorrectAnswer] = useState(item?.correct_answer || "");
  const [explanation, setExplanation] = useState(item?.explanation || "");
  const [isPublished, setIsPublished] = useState(item?.is_published ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // Validation
    if (!structureType.trim()) {
      toast.error("Structure type is required");
      return;
    }
    if (!imageUrl.trim()) {
      toast.error("Image URL is required");
      return;
    }
    if (!correctAnswer.trim()) {
      toast.error("Correct answer is required");
      return;
    }

    setSaving(true);

    const payload = {
      category_id: categoryId,
      structure_type: structureType.trim(),
      image_url: imageUrl.trim(),
      correct_answer: correctAnswer.trim(),
      explanation: explanation.trim() || null,
      is_published: isPublished,
    };

    try {
      if (item?.id) {
        // Update existing item
        const { error } = await supabase
          .from("practical_items")
          .update(payload)
          .eq("id", item.id);
        if (error) throw error;
        toast.success("Practical item updated successfully");
      } else {
        // Insert new item
        const { error } = await supabase
          .from("practical_items")
          .insert(payload);
        if (error) throw error;
        toast.success("Practical item added successfully");
      }
      onSaved();
    } catch (error) {
      const err = error as Error;
      toast.error(err.message || "Failed to save practical item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">
          {item ? "Edit Practical Item" : "Add Single Label"}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Structure Type
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              placeholder="e.g., Bone, Muscle, Nerve, Artery"
              value={structureType}
              onChange={(e) => setStructureType(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Image URL
            </label>
            <input
              type="url"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              placeholder="https://example.com/image.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            {imageUrl && (
              <div className="mt-2">
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="w-full h-40 object-contain rounded-lg bg-muted"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Correct Answer
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              placeholder="e.g., Femur, Biceps Brachii"
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Explanation (optional)
            </label>
            <textarea
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
              rows={3}
              placeholder="Add explanation or additional information..."
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is-published"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="rounded border-border"
            />
            <label htmlFor="is-published" className="text-sm">
              Publish immediately
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            className="btn-outline px-4 py-2"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn-primary px-4 py-2"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : item ? "Update" : "Add Item"}
          </button>
        </div>
      </div>
    </div>
  );
}

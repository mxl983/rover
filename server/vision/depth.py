import cv2
import torch
import matplotlib.pyplot as plt

# 1. Load the model from TorchHub (Small version is fast enough for a Pi/laptop)
model_type = "MiDaS_small"
midas = torch.hub.load("intel-isl/MiDaS", model_type)

# 2. Use GPU if available (otherwise CPU)
device = torch.device(
    "cuda") if torch.cuda.is_available() else torch.device("cpu")
midas.to(device)
midas.eval()

# 3. Load transforms to resize and normalize the image
midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms")
transform = midas_transforms.small_transform if model_type == "MiDaS_small" else midas_transforms.dpt_transform

# 4. Load your image
img = cv2.imread('../../photos/capture_1770261526914.jpg')
img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

# 5. Transform and predict
input_batch = transform(img).to(device)

with torch.no_grad():
  prediction = midas(input_batch)
  # Resize to original image size
  prediction = torch.nn.functional.interpolate(
      prediction.unsqueeze(1),
      size=img.shape[:2],
      mode="bicubic",
      align_corners=False,
  ).squeeze()

depth_map = prediction.cpu().numpy()

# 6. Display the result
plt.imshow(depth_map, cmap='magma')
plt.colorbar(label='Relative Depth (Bright = Near)')
plt.show()
